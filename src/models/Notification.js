const supabase = require('../config/supabase');

function throwOnError(error) {
  if (!error) return;
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}`, { cause: error });
}

function mapNotification(row) {
  return { ...row, _id: row.id, recipient: row.recipient_id, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}

module.exports = {
  async findForRecipient(recipientId) {
    const { data, error } = await supabase.from('notifications').select('*').eq('recipient_id', recipientId).order('created_at', { ascending: false }).limit(20);
    throwOnError(error);
    return (data || []).map(mapNotification);
  },
  async insertMany(notifications) {
    if (!notifications.length) return [];
    const rows = notifications.map((notification) => ({
      recipient_id: notification.recipient, title: notification.title, message: notification.message, link: notification.link || '/dashboard'
    }));
    const { data, error } = await supabase.from('notifications').insert(rows).select('*');
    throwOnError(error);
    return data.map(mapNotification);
  },
  async markAllRead(recipientId) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('recipient_id', recipientId).eq('read', false);
    throwOnError(error);
  }
};
