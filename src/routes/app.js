const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const Post = require('../models/Post');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const Team = require('../models/Team');
const teamUpload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 250 * 1024 * 1024 }
});

router.use(requireAuth);
router.get('/', (req, res) => res.redirect('/dashboard'));
router.get('/dashboard', async (req, res, next) => {
  try {
    const [posts, notifications, users, events, teams] = await Promise.all([
      Post.find(),
      Notification.findForRecipient(req.session.userId),
      User.find({ active: true }),
      Event.findForUser(req.session.userId),
      Team.findForUser(req.session.userId)
    ]);
    res.render('dashboard', { title: 'Dashboard', posts, notifications, users, events, teams });
  } catch (error) { next(error); }
});
router.get('/profiles/:id', async (req, res, next) => {
  try {
    if (req.params.id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).render('error', { title: 'Access denied', message: 'You cannot view this profile picture.' });
    }
    const user = await User.findById(req.params.id);
    if (!user?.profile_picture) return res.status(404).render('error', { title: 'Not found', message: 'Profile picture not available.' });
    const file = path.join(__dirname, '../../uploads', path.basename(user.profile_picture));
    if (!fs.existsSync(file)) return res.status(404).render('error', { title: 'Not found', message: 'Profile picture not available.' });
    res.sendFile(file);
  } catch (error) { next(error); }
});
router.get('/chat', async (req, res, next) => {
  try {
    const users = await User.find({ active: true, _id: { $ne: req.session.userId } });
    const messages = await Message.findForUser(req.session.userId);
    res.render('chat', { title: 'Team chat', users, messages });
  } catch (error) { next(error); }
});
router.get('/teams/:id', async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team || !(await Team.isMember(team._id, req.session.userId))) return res.status(403).render('error', { title: 'Access denied', message: 'You are not a member of this team.' });
    const memberRows = await Team.members(team._id);
    const memberIds = memberRows.map((member) => member.user_id);
    const [users, messages, files] = await Promise.all([
      User.find({ active: true, _id: { $in: memberIds } }),
      Message.findForTeam(team._id),
      Post.findForTeam(team._id)
    ]);
    res.render('team-chat', { title: team.name, team, users, messages, files });
  } catch (error) { next(error); }
});
router.get('/teams/:id/invite', async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team || !(await Team.hasInvitation(team._id, req.session.userId))) {
      return res.redirect('/dashboard');
    }
    res.render('team-invite', { title: 'Team invitation', team });
  } catch (error) { next(error); }
});
router.post('/teams/:id/invite/accept', async (req, res, next) => {
  try {
    await Team.respondToInvite(req.params.id, req.session.userId, 'accepted');
    req.app.get('io').sockets.sockets.forEach((socket) => {
      if (socket.data.userId === req.session.userId) socket.join(`team:${req.params.id}`);
    });
    req.app.get('io').to(`team:${req.params.id}`).emit('team:membership', { teamId: req.params.id, userId: req.session.userId });
    res.redirect(`/teams/${req.params.id}`);
  } catch (error) { next(error); }
});
router.post('/teams/:id/invite/decline', async (req, res, next) => {
  try {
    await Team.respondToInvite(req.params.id, req.session.userId, 'declined');
    res.redirect('/dashboard');
  } catch (error) { next(error); }
});
router.get('/team-logo/:id', async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team?.logo) return res.status(404).send('Team logo unavailable');
    if (!(await Team.isMember(team._id, req.session.userId))) return res.status(403).send('Team membership is required.');
    const file = path.join(__dirname, '../../uploads', path.basename(team.logo));
    if (!fs.existsSync(file)) return res.status(404).send('Team logo unavailable');
    res.sendFile(file);
  } catch (error) { next(error); }
});
router.post('/teams/:id/files', teamUpload.single('file'), async (req, res, next) => {
  try {
    if (!(await Team.isMember(req.params.id, req.session.userId))) return res.status(403).json({ error: 'Team membership is required.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file to share.' });
    const post = await Post.create({
      title: req.file.originalname, description: String(req.body.description || '').trim(),
      type: req.file.mimetype.startsWith('video/') ? 'video' : 'document',
      author: req.session.userId, teamId: req.params.id, fileName: req.file.originalname,
      filePath: req.file.filename, fileSize: req.file.size, mimeType: req.file.mimetype
    });
    req.app.get('io').to(`team:${req.params.id}`).emit('team:file', post);
    res.status(201).json(post);
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
});
router.post('/notifications/read', async (req, res, next) => {
  try { await Notification.markAllRead(req.session.userId); res.redirect('/dashboard'); }
  catch (error) { next(error); }
});
router.get('/api/inbox', async (req, res, next) => {
  try {
    const [notifications, messages, users] = await Promise.all([
      Notification.findForRecipient(req.session.userId),
      Message.findForUser(req.session.userId),
      User.find({ active: true })
    ]);
    res.json({
      notifications,
      messages,
      users
    });
  } catch (error) { next(error); }
});
router.get('/api/events', async (req, res, next) => {
  try { res.json(await Event.findForUser(req.session.userId)); }
  catch (error) { next(error); }
});
router.post('/api/events', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const startsAt = String(req.body.startsAt || '');
    const endsAt = String(req.body.endsAt || '');
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (!title || Number.isNaN(start.getTime())) return res.status(400).json({ error: 'A title and valid start date/time are required.' });
    if (end && end <= start) return res.status(400).json({ error: 'The end date/time must be after the start date/time.' });
    const reminderMinutes = Math.max(0, Math.min(1440, Number(req.body.reminderMinutes || 15)));
    const sharedWith = [...new Set(Array.isArray(req.body.sharedWith) ? req.body.sharedWith : req.body.sharedWith ? [req.body.sharedWith] : [])];
    const event = await Event.create({
      owner: req.session.userId, title, startsAt: start.toISOString(), endsAt: end?.toISOString() || null,
      description: String(req.body.description || '').trim(), location: String(req.body.location || '').trim(),
      reminderMinutes, sharedWith
    });
    if (sharedWith.length) {
      const notifications = await Notification.insertMany(sharedWith.map((recipient) => ({
        recipient,
        title: 'Event shared with you',
        message: `${req.session.userName} scheduled "${event.title}"`,
        link: '/dashboard'
      })));
      notifications.forEach((notification) => req.app.get('io').to(`user:${notification.recipient}`).emit('notification:new', notification));
    }
    res.status(201).json(event);
  } catch (error) { next(error); }
});
router.post('/resources/:id/share', async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Resource not found.' });
    const recipientIds = [...new Set(Array.isArray(req.body.recipientIds) ? req.body.recipientIds : req.body.recipientIds ? [req.body.recipientIds] : [])];
    if (!recipientIds.length) return res.status(400).json({ error: 'Select at least one user.' });
    const recipients = recipientIds.filter((id) => id !== req.session.userId);
    const notifications = await Notification.insertMany(recipients.map((recipient) => ({
      recipient, title: 'File shared with you',
      message: `${req.session.userName} shared "${post.title}"`,
      link: `/files/${post._id}`
    })));
    recipients.forEach((id) => req.app.get('io').to(`user:${id}`).emit('notification:new', notifications.find((item) => item.recipient === id)));
    res.json({ shared: recipients.length });
  } catch (error) { next(error); }
});
router.get('/files/:id', async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || !post.filePath) return res.status(404).render('error', { title: 'Not found', message: 'The requested resource could not be found.' });
    if (post.teamId && !(await Team.isMember(post.teamId, req.session.userId))) {
      return res.status(403).render('error', { title: 'Access denied', message: 'You are not a member of this team.' });
    }
    const file = path.join(__dirname, '../../uploads', path.basename(post.filePath));
    if (!fs.existsSync(file)) return res.status(404).render('error', { title: 'File unavailable', message: 'This file is no longer available.' });
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${post.fileName}"`);
    res.sendFile(file);
  } catch (error) { next(error); }
});
module.exports = router;
