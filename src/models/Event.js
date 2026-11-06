const supabase = require('../config/supabase');

function throwOnError(error) {
  if (!error) return;
  throw new Error(`Database request failed: ${error.message || 'Unknown error'}`, { cause: error });
}

function mapEvent(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    startsAt: row.starts_at,
    reminderMinutes: row.reminder_minutes,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at
  };
}

module.exports = {
  async findForUser(userId) {
    const { data, error } = await supabase.from('events').select('*').or(`owner_id.eq.${userId},shared_with.cs.{${userId}}`).order('starts_at', { ascending: true });
    throwOnError(error);
    return (data || []).map(mapEvent);
  },
  async create(values) {
    const row = {
      owner_id: values.owner,
      title: values.title,
      description: values.description || '',
      location: values.location || '',
      starts_at: values.startsAt,
      ends_at: values.endsAt || null,
      reminder_minutes: values.reminderMinutes,
      shared_with: values.sharedWith || [],
      category: values.category || 'meeting',
      all_day: values.allDay === true
    };
    const { data, error } = await supabase.from('events').insert(row).select('*').single();
    throwOnError(error);
    return mapEvent(data);
  },
  async findById(id) {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    throwOnError(error);
    return mapEvent(data);
  },
  async update(id, values) {
    const row = {
      title: values.title,
      description: values.description || '',
      location: values.location || '',
      starts_at: values.startsAt,
      ends_at: values.endsAt || null,
      reminder_minutes: values.reminderMinutes,
      shared_with: values.sharedWith || [],
      category: values.category || 'meeting',
      all_day: values.allDay === true,
      reminder_sent_at: null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('events').update(row).eq('id', id).select('*').single();
    throwOnError(error);
    return mapEvent(data);
  },
  async remove(id) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    throwOnError(error);
  },
  async findDueForReminder() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await supabase.from('events').select('*')
      .is('reminder_sent_at', null)
      .gte('starts_at', now.toISOString())
      .lte('starts_at', horizon.toISOString());
    throwOnError(error);
    return (data || []).filter((event) => {
      const start = new Date(event.starts_at).getTime();
      const reminder = new Date(start - event.reminder_minutes * 60 * 1000).getTime();
      return now.getTime() >= reminder;
    }).map(mapEvent);
  },
  async markReminderSent(id) {
    const { error } = await supabase.from('events').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
    throwOnError(error);
  }
};
