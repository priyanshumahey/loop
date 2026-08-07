import type { EventColor } from "@/components/event-calendar/types"
import { currentUser, type ServiceResult } from "@/lib/db/service"
import { createClient } from "@/lib/supabase/server"

export type CalendarShareView = "week" | "month" | "agenda"
export type CalendarShareWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface CalendarShare {
  id: string
  token: string
  name: string
  view: CalendarShareView
  showEventNames: boolean
  startDate: string
  endDate: string
  visibleWeekdays: CalendarShareWeekday[]
  timezone: string
  active: boolean
}

export interface PublicCalendarShare {
  name: string
  view: CalendarShareView
  showEventNames: boolean
  startDate: string
  endDate: string
  visibleWeekdays: CalendarShareWeekday[]
  timezone: string
}

export interface PublicCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  color: EventColor | null
}

interface DbCalendarShare {
  id: string
  token: string
  name: string
  view: CalendarShareView
  show_event_names: boolean
  start_date: string
  end_date: string
  visible_weekdays: CalendarShareWeekday[]
  timezone: string
  active: boolean
}

const SHARE_COLUMNS =
  "id, token, name, view, show_event_names, start_date, end_date, visible_weekdays, timezone, active"

function toCalendarShare(row: DbCalendarShare): CalendarShare {
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    view: row.view,
    showEventNames: row.show_event_names,
    startDate: row.start_date,
    endDate: row.end_date,
    visibleWeekdays: row.visible_weekdays,
    timezone: row.timezone,
    active: row.active,
  }
}

export async function getCalendarShares(): Promise<
  ServiceResult<CalendarShare[]>
> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase
    .from("calendar_shares")
    .select(SHARE_COLUMNS)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: ((data ?? []) as DbCalendarShare[]).map(toCalendarShare),
  }
}

export async function createCalendarShare(input: {
  name: string
  view: CalendarShareView
  showEventNames: boolean
  startDate: string
  endDate: string
  visibleWeekdays: CalendarShareWeekday[]
  timezone: string
}): Promise<ServiceResult<CalendarShare>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase
    .from("calendar_shares")
    .insert({
      user_id: auth.user.id,
      name: input.name,
      view: input.view,
      show_event_names: input.showEventNames,
      start_date: input.startDate,
      end_date: input.endDate,
      visible_weekdays: input.visibleWeekdays,
      timezone: input.timezone,
    })
    .select(SHARE_COLUMNS)
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: toCalendarShare(data as DbCalendarShare) }
}

export async function updateCalendarShare(
  id: string,
  input: Partial<{
    name: string
    view: CalendarShareView
    showEventNames: boolean
    startDate: string
    endDate: string
    visibleWeekdays: CalendarShareWeekday[]
    timezone: string
    active: boolean
  }>
): Promise<ServiceResult<CalendarShare>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const values = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.view !== undefined && { view: input.view }),
    ...(input.showEventNames !== undefined && {
      show_event_names: input.showEventNames,
    }),
    ...(input.startDate !== undefined && { start_date: input.startDate }),
    ...(input.endDate !== undefined && { end_date: input.endDate }),
    ...(input.visibleWeekdays !== undefined && {
      visible_weekdays: input.visibleWeekdays,
    }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    ...(input.active !== undefined && { active: input.active }),
  }
  const { data, error } = await auth.supabase
    .from("calendar_shares")
    .update(values)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select(SHARE_COLUMNS)
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: toCalendarShare(data as DbCalendarShare) }
}

export async function deleteCalendarShare(
  id: string
): Promise<ServiceResult<null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { error } = await auth.supabase
    .from("calendar_shares")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function getPublicCalendarShare(
  token: string
): Promise<ServiceResult<PublicCalendarShare | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_calendar_share", {
    p_token: token,
  })
  if (error) return { success: false, error: error.message }

  const row = (data?.[0] ?? null) as {
    name: string
    view: CalendarShareView
    show_event_names: boolean
    start_date: string
    end_date: string
    visible_weekdays: CalendarShareWeekday[]
    timezone: string
  } | null
  return {
    success: true,
    data: row
      ? {
          name: row.name,
          view: row.view,
          showEventNames: row.show_event_names,
          startDate: row.start_date,
          endDate: row.end_date,
          visibleWeekdays: row.visible_weekdays,
          timezone: row.timezone,
        }
      : null,
  }
}

export async function getPublicCalendarEvents(
  token: string,
  start: Date,
  end: Date
): Promise<ServiceResult<PublicCalendarEvent[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_calendar_events", {
    p_token: token,
    p_start_time: start.toISOString(),
    p_end_time: end.toISOString(),
  })
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: ((data ?? []) as {
      id: string
      title: string
      start_time: string
      end_time: string
      all_day: boolean
      color: EventColor | null
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      allDay: row.all_day,
      color: row.color,
    })),
  }
}