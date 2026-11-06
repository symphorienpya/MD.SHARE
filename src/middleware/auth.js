exports.requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.mustChangePassword && req.path !== '/change-password') {
    return res.redirect('/change-password');
  }
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.role !== 'admin') return res.status(403).render('error', { title: 'Access denied', message: 'Administrator access is required.' });
  next();
};
