const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

router.get('/login', (req, res) => res.render('login', { title: 'Sign in', error: null, email: '' }));
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, active: true });
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).render('login', { title: res.locals.t('signIn'), error: res.locals.t('loginIncorrect'), email: normalizedEmail });
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user._id.toString();
      req.session.role = user.role;
      req.session.userName = user.name;
      req.session.mustChangePassword = user.mustChangePassword;
      req.session.save((saveError) => saveError ? next(saveError) : res.redirect(user.mustChangePassword ? '/change-password' : '/dashboard'));
    });
  } catch (error) { next(error); }
});
router.get('/change-password', requireAuth, (req, res) => res.render('change-password', { title: 'Change password', error: null }));
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;
    if (!password || password.length < 8 || password !== confirmPassword) {
      return res.status(400).render('change-password', { title: 'Change password', error: 'Use at least 8 characters and make sure both fields match.' });
    }
    await User.findByIdAndUpdate(req.session.userId, { password: await bcrypt.hash(password, 12), mustChangePassword: false });
    req.session.mustChangePassword = false;
    res.redirect('/dashboard');
  } catch (error) { next(error); }
});
router.post('/logout', requireAuth, (req, res, next) => req.session.destroy((error) => error ? next(error) : res.redirect('/login')));
module.exports = router;
