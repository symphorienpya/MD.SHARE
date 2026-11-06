const supabase = require('../config/supabase');

function throwOnError(error) {
  if (!error) return;
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}`, { cause: error });
}

function mapTeam(row) {
  if (!row) return null;
  return { ...row, _id: row.id, logo: row.logo_path, createdAt: new Date(row.created_at) };
}

module.exports = {
  async create({ name, logo, owner }) {
    const { data, error } = await supabase.from('teams').insert({
      name, logo_path: logo || null, owner_id: owner
    }).select('*').single();
    throwOnError(error);
    return mapTeam(data);
  },
  async findAll() {
    const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: false });
    throwOnError(error);
    return (data || []).map(mapTeam);
  },
  async findById(id) {
    const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
    throwOnError(error);
    return mapTeam(data);
  },
  async findForUser(userId) {
    const { data, error } = await supabase.from('team_members').select('team_id, role, teams(*)').eq('user_id', userId).eq('status', 'accepted');
    throwOnError(error);
    return (data || []).filter((row) => row.teams).map((row) => ({ ...mapTeam(row.teams), membershipRole: row.role }));
  },
  async invite(teamId, userId, invitedBy) {
    const { data, error } = await supabase.from('team_members').upsert({
      team_id: teamId, user_id: userId, invited_by: invitedBy, role: 'member', status: 'invited'
    }, { onConflict: 'team_id,user_id' }).select('*').single();
    throwOnError(error);
    return data;
  },
  async addMember(teamId, userId, role = 'admin') {
    const { data, error } = await supabase.from('team_members').upsert({
      team_id: teamId, user_id: userId, invited_by: userId, role, status: 'accepted',
      responded_at: new Date().toISOString()
    }, { onConflict: 'team_id,user_id' }).select('*').single();
    throwOnError(error);
    return data;
  },
  async respondToInvite(teamId, userId, status) {
    const { error } = await supabase.from('team_members').update({
      status, responded_at: new Date().toISOString()
    }).eq('team_id', teamId).eq('user_id', userId).eq('status', 'invited');
    throwOnError(error);
  },
  async isMember(teamId, userId) {
    const { data, error } = await supabase.from('team_members').select('id')
      .eq('team_id', teamId).eq('user_id', userId).eq('status', 'accepted').maybeSingle();
    throwOnError(error);
    return Boolean(data);
  },
  async members(teamId) {
    const { data, error } = await supabase.from('team_members').select('user_id, role, status').eq('team_id', teamId).eq('status', 'accepted');
    throwOnError(error);
    return data || [];
  }
};
