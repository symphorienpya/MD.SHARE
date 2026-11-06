const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

exports.sendEventReminder = async ({ recipients, event }) => {
  const mailer = getTransporter();
  if (!mailer || !recipients.length) return false;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const start = new Date(event.starts_at).toLocaleString();
  await mailer.sendMail({
    from,
    to: recipients,
    subject: `Reminder: ${event.title}`,
    text: `${event.title} starts at ${start}.${event.location ? ` Location: ${event.location}` : ''}`,
    html: `<p><strong>${event.title}</strong> starts at ${start}.</p>${event.location ? `<p>Location: ${event.location}</p>` : ''}`
  });
  return true;
};
