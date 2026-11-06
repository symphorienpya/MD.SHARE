const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Team = require('../models/Team');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = ['video/', 'application/pdf', 'image/', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain'];
    callback(null, allowed.some((type) => file.mimetype.startsWith(type)));
  }
});
const profileUpload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  }
});
const teamUpload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

router.get('/', async (req, res, next) => {
  try {
    const [users, posts] = await Promise.all([User.countDocuments(), Post.countDocuments()]);
    res.render('admin/dashboard', { title: 'Administration', stats: { users, posts } });
  } catch (error) { next(error); }
});
router.get('/users', async (req, res, next) => {
  try { res.render('admin/users', { title: 'Manage users', users: await User.find(), error: null }); }
  catch (error) { next(error); }
});
router.post('/users', profileUpload.single('profilePicture'), async (req, res, next) => {
  try {
    const { name, email, password, mobile } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 8 || !mobile?.trim()) {
      throw new Error('Name, email, mobile number, and an 8-character password are required.');
    }
    if (!req.file) throw new Error('A JPEG, PNG, or WebP profile picture is required.');
    await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(password, 12),
      mobile: mobile.trim(),
      profilePicture: req.file.filename,
      role: 'user',
      mustChangePassword: true
    });
    res.redirect('/admin/users');
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).render('admin/users', { title: 'Manage users', users: await User.find(), error: error.message });
  }
});
router.post('/users/:id/toggle', async (req, res, next) => {
  try { const user = await User.toggleNonAdmin(req.params.id); if (user) res.redirect('/admin/users'); else res.status(404).send('User not found'); }
  catch (error) { next(error); }
});
router.get('/posts', async (req, res, next) => {
  try { res.render('admin/posts', { title: 'Manage resources', posts: await Post.find(), error: null }); }
  catch (error) { next(error); }
});
router.get('/teams', async (req, res, next) => {
  try {
    res.render('admin/teams', { title: 'Teams', teams: await Team.findAll(), users: await User.find({ active: true }), error: null });
  } catch (error) { next(error); }
});
router.post('/teams', teamUpload.single('logo'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) throw new Error('A team name is required.');
    const team = await Team.create({ name, logo: req.file?.filename || null, owner: req.session.userId });
    await Team.addMember(team._id, req.session.userId, 'admin');
    for (const email of [...new Set(String(req.body.emails || '').split(/[,\n;]/).map((value) => value.trim().toLowerCase()).filter(Boolean))]) {
      const user = await User.findOne({ email });
      if (!user) continue;
      await Team.invite(team._id, user._id, req.session.userId);
      await Message.create({
        sender: req.session.userId,
        recipient: user._id,
        teamId: team._id,
        body: `${req.session.userName} invited you to join the team "${team.name}".`
      });
      const [notification] = await Notification.insertMany([{
        recipient: user._id, title: 'Team invitation',
        message: `${req.session.userName} invited you to join ${team.name}`,
        link: `/teams/${team._id}/invite`
      }]);
      req.app.get('io').to(`user:${user._id}`).emit('team:invitation', { teamId: team._id, notification });
    }
    res.redirect('/admin/teams');
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).render('admin/teams', { title: 'Teams', teams: await Team.findAll(), users: await User.find({ active: true }), error: error.message });
  }
});
router.post('/posts', upload.single('file'), async (req, res, next) => {
  try {
    const { title, description, type, url } = req.body;
    if (!title || !type) throw new Error('Title and resource type are required.');
    const data = { title, description, type, author: req.session.userId, url };
    if (type === 'link' && !url) throw new Error('A link URL is required.');
    if (type !== 'link' && !req.file) throw new Error('Choose a file to upload.');
    if (req.file) Object.assign(data, { fileName: req.file.originalname, filePath: req.file.filename, fileSize: req.file.size, mimeType: req.file.mimetype });
    const post = await Post.create(data);
    const recipients = await User.find({ _id: { $ne: req.session.userId }, active: true });
    const notifications = recipients.map((user) => ({ recipient: user._id, title: 'New resource shared', message: post.title, link: '/dashboard' }));
    await Notification.insertMany(notifications);
    req.app.get('io').emit('resource:new', { title: post.title, type: post.type });
    res.redirect('/admin/posts');
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    const posts = await Post.find();
    res.status(400).render('admin/posts', { title: 'Manage resources', posts, error: error.message });
  }
});
router.post('/posts/:id/delete', async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (post && post.filePath) fs.unlink(path.join(__dirname, '../../uploads', post.filePath), () => {});
    await Post.findByIdAndDelete(req.params.id);
    res.redirect('/admin/posts');
  } catch (error) { next(error); }
});
module.exports = router;
