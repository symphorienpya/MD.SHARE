const supabase = require('../config/supabase');
const User = require('./User');

function mapPost(row, authors = {}) {
  if (!row) return null;
  const author = authors[row.author_id] || (row.author_id === undefined ? null : { _id: row.author_id });
  return {
    ...row,
    _id: row.id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    teamId: row.team_id,
    author,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function throwOnError(error) {
  if (!error) return;
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}`, { cause: error });
}

async function withAuthors(posts) {
  const ids = [...new Set(posts.map((post) => post.author_id).filter(Boolean))];
  const authors = {};
  if (ids.length) {
    const users = await User.find({ _id: { $in: ids } });
    users.forEach((user) => { authors[user._id] = user; });
  }
  return posts.map((post) => mapPost(post, authors));
}

module.exports = {
  async find() {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    throwOnError(error);
    return withAuthors(data || []);
  },
  async findById(id) {
    const { data, error } = await supabase.from('posts').select('*').eq('id', id).maybeSingle();
    throwOnError(error);
    if (!data) return null;
    const authors = await withAuthors([data]);
    return authors[0];
  },
  async findForTeam(teamId) {
    const { data, error } = await supabase.from('posts').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: true });
    throwOnError(error);
    return withAuthors(data || []);
  },
  async create(values) {
    const row = {
      title: values.title, description: values.description || '', type: values.type, url: values.url || null,
      file_name: values.fileName || null, file_path: values.filePath || null, file_size: values.fileSize || null,
      mime_type: values.mimeType || null, author_id: values.author, team_id: values.teamId || null
    };
    const { data, error } = await supabase.from('posts').insert(row).select('*').single();
    throwOnError(error);
    return mapPost(data);
  },
  async findByIdAndDelete(id) {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    throwOnError(error);
  },
  async countDocuments() {
    const { count, error } = await supabase.from('posts').select('id', { count: 'exact', head: true });
    throwOnError(error);
    return count || 0;
  }
};
