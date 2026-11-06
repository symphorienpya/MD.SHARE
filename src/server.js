require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');
const Message = require('./models/Message');
const User = require('./models/User');
const supabase = require('./config/supabase');
const Event = require('./models/Event');
const Notification = require('./models/Notification');
const i18n = require('./i18n');
const Team = require('./models/Team');
const mailer = require('./services/mailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'development-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
});
app.use(sessionMiddleware);
app.use(i18n.middleware);
app.post('/language', (req, res) => {
  const locale = req.body.locale === 'en' ? 'en' : 'fr';
  req.session.locale = locale;
  res.cookie('locale', locale, { httpOnly: true, sameSite: 'lax' });
  res.redirect(req.get('referer') || '/dashboard');
});
app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId ? { id: req.session.userId, name: req.session.userName, role: req.session.role } : null;
  next();
});

app.use(authRoutes);
app.use(appRoutes);
app.use('/admin', adminRoutes);
app.use((req, res) => res.status(404).render('error', { title: 'Page not found', message: 'The page you requested does not exist.' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', { title: 'Something went wrong', message: 'The request could not be completed.' });
});

io.engine.use(sessionMiddleware);
io.on('connection', async (socket) => {
  const session = socket.request.session;
  if (!session?.userId) return socket.disconnect();
  socket.join('users');
  socket.join(`user:${session.userId}`);
  let memberTeams = [];
  try {
    memberTeams = await Team.findForUser(session.userId);
  } catch (error) {
    console.error('Could not load team rooms:', error.message);
  }
  memberTeams.forEach((team) => socket.join(`team:${team._id}`));
  socket.data.userId = session.userId;
  socket.data.userName = session.userName;
  try {
    io.to('users').emit('presence:update', await onlineUsers(io));
  } catch (error) {
    console.error('Could not load online users:', error.message);
  }
  socket.on('chat:send', async ({ body, recipient, teamId, replyToId }) => {
    const cleanBody = String(body || '').trim().slice(0, 2000);
    if (!cleanBody) return;
    if (teamId) {
      if (!(await Team.isMember(teamId, session.userId))) return;
      const replyTo = String(replyToId || '');
      if (replyTo) {
        const parent = await Message.findById(replyTo);
        if (!parent || String(parent.teamId) !== String(teamId)) return;
      }
      const message = await Message.create({ sender: session.userId, recipient: null, teamId, body: cleanBody, replyToId: replyTo || null });
      io.to(`team:${teamId}`).emit('team:message', message);
      return;
    }
    const recipientId = recipient || null;
    const message = await Message.create({ sender: session.userId, recipient: recipientId, body: cleanBody });
    if (recipientId) {
      io.sockets.sockets.forEach((client) => {
        if (client.data.userId === recipientId || client.data.userId === session.userId) client.emit('chat:message', message);
      });
      io.to(`user:${recipientId}`).emit('message:new', message);
    } else io.to('users').emit('chat:message', message);
  });
  socket.on('disconnect', () => setTimeout(async () => {
    try {
      io.to('users').emit('presence:update', await onlineUsers(io));
    } catch (error) {
      console.error('Could not refresh online users:', error.message);
    }
  }, 50));
});

async function onlineUsers(ioServer) {
  const ids = [...new Set([...ioServer.sockets.sockets.values()].map((socket) => socket.data.userId).filter(Boolean))];
  const users = await User.find({ _id: { $in: ids } });
  return users.map((user) => ({ id: user._id, name: user.name, role: user.role }));
}

const port = Number(process.env.PORT) || 3000;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT to an available port or stop the process using it.`);
    process.exitCode = 1;
    return;
  }
  throw error;
});
async function verifyDatabase() {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
}

async function processEventReminders() {
  try {
    const dueEvents = await Event.findDueForReminder();
    for (const event of dueEvents) {
      const recipientIds = [...new Set([event.owner_id, ...(event.shared_with || [])])];
      const notifications = await Notification.insertMany(recipientIds.map((recipient) => ({
        recipient,
        title: 'Event reminder',
        message: `${event.title} starts soon`,
        link: '/dashboard'
      })));
      await Event.markReminderSent(event._id);
      notifications.forEach((notification) => io.to(`user:${notification.recipient}`).emit('notification:new', notification));
      const recipients = await User.find({ _id: { $in: recipientIds } });
      await mailer.sendEventReminder({
        recipients: recipients.map((recipient) => recipient.email).filter(Boolean),
        event
      });
    }
  } catch (error) {
    console.error('Event reminder processing failed:', error.message);
  }
}

server.listen(port, () => {
  verifyDatabase()
    .then(() => {
      console.log(`Point.share MDai listening on http://localhost:${port} (database connected)`);
      processEventReminders();
      setInterval(processEventReminders, 30 * 1000);
    })
    .catch((error) => {
      console.error(error);
      console.error(`Point.share MDai listening on http://localhost:${port}, but the database is unavailable.`);
    });
});
