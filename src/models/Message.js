const supabase = require('../config/supabase');
const User = require('./User');

function throwOnError(error) {
  if (!error) return;
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}`, { cause: error });
}

function mapMessage(row, sender) {
  return { ...row, _id: row.id, sender, recipient: row.recipient_id, team: row.team_id, teamId: row.team_id,
    replyToId: row.reply_to_id || null, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}

async function hydrate(rows) {
  const ids = [...new Set(rows.map((row) => row.sender_id).filter(Boolean))];
  const senders = {};
  if (ids.length) {
    (await User.find({ _id: { $in: ids } })).forEach((user) => { senders[user._id] = user; });
  }
  return rows.map((row) => mapMessage(row, senders[row.sender_id] || { _id: row.sender_id }));
}

module.exports = {
  async create({ sender, recipient, body, teamId, replyToId }) {
    const { data, error } = await supabase.from('messages').insert({
      sender_id: sender, recipient_id: recipient || null, body, team_id: teamId || null, reply_to_id: replyToId || null
    }).select('*').single();
    throwOnError(error);
    const users = await User.find({ _id: { $in: [sender] } });
    return mapMessage(data, users[0] || { _id: sender });
  },
  async findForUser(userId) {
    const { data, error } = await supabase.from('messages').select('*')
      .or(`recipient_id.is.null,sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: true }).limit(100);
    throwOnError(error);
    return hydrate(data || []);
  },
  async findForTeam(teamId) {
    const { data, error } = await supabase.from('messages').select('*').eq('team_id', teamId).order('created_at', { ascending: true }).limit(200);
    throwOnError(error);
    return hydrate(data || []);
  },
  async findById(id) {
    const { data, error } = await supabase.from('messages').select('*').eq('id', id).maybeSingle();
    throwOnError(error);
    if (!data) return null;
    return (await hydrate([data]))[0];
  }
};
