require('dotenv').config();
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

(async () => {
  const email = (process.env.ADMIN_EMAIL || 'admin@pointshare.local').toLowerCase();
  if (!email.includes('@')) {
    throw new Error(`ADMIN_EMAIL must be a valid email address. Received: ${email}`);
  }
  const password = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12);
  const existing = await User.findOne({ email });
  if (existing) {
    await User.findByIdAndUpdate(existing._id, {
      name: process.env.ADMIN_NAME || 'Administrator',
      password,
      role: 'admin',
      active: true,
      mustChangePassword: false
    });
    console.log(`Admin credentials refreshed: ${email}`);
    return;
  }
  await User.create({
    name: process.env.ADMIN_NAME || 'Administrator',
    email,
    password,
    role: 'admin',
    mustChangePassword: false
  });
  console.log(`Admin created: ${email}`);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
