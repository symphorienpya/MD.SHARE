const supabase = require('../config/supabase');

function mapUser(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    mustChangePassword: row.must_change_password,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function throwOnError(error) {
  if (!error) return;
  const cause = error.cause ? ` ${error.cause.message || ''}`.trim() : '';
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}${cause ? ` (${cause})` : ''}`, { cause: error });
}

module.exports = {
  async findOne({ email, active } = {}) {
    let query = supabase.from('users').select('*');
    if (email !== undefined) query = query.eq('email', email);
    if (active !== undefined) query = query.eq('active', active);
    const { data, error } = await query.limit(1).maybeSingle();
    throwOnError(error);
    return mapUser(data);
  },
  async findById(id) {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    throwOnError(error);
    return mapUser(data);
  },
  async find({ active, _id } = {}) {
    let query = supabase.from('users').select('*');
    if (active !== undefined) query = query.eq('active', active);
    if (_id?.$ne) query = query.neq('id', _id.$ne);
    if (_id?.$in) query = query.in('id', _id.$in);
    const { data, error } = await query.order('created_at', { ascending: false });
    throwOnError(error);
    return data.map(mapUser);
  },
  async create(values) {
    const row = {
      name: values.name,
      email: values.email,
      password: values.password,
      role: values.role || 'user',
      must_change_password: values.mustChangePassword !== false,
      active: values.active !== false,
      mobile: values.mobile || null,
      profile_picture: values.profilePicture || null
    };
    const { data, error } = await supabase.from('users').insert(row).select('*').single();
    throwOnError(error);
    return mapUser(data);
  },
  async findByIdAndUpdate(id, values) {
    const updates = {};
    if (values.password !== undefined) updates.password = values.password;
    if (values.mustChangePassword !== undefined) updates.must_change_password = values.mustChangePassword;
    if (values.name !== undefined) updates.name = values.name;
    if (values.role !== undefined) updates.role = values.role;
    if (values.active !== undefined) updates.active = values.active;
    if (values.mobile !== undefined) updates.mobile = values.mobile;
    if (values.profilePicture !== undefined) updates.profile_picture = values.profilePicture;
    const { data, error } = await supabase.from('users').update(updates).eq('id', id).select('*').single();
    throwOnError(error);
    return mapUser(data);
  },
  async toggleNonAdmin(id) {
    const user = await this.findById(id);
    if (!user || user.role === 'admin') return null;
    const { data, error } = await supabase.from('users').update({ active: !user.active }).eq('id', id).select('*').single();
    throwOnError(error);
    return mapUser(data);
  },
  async countDocuments() {
    const { count, error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    throwOnError(error);
    return count || 0;
  }
};
