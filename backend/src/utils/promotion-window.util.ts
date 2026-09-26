/**
 * When a cycle accepts applications, in Philippine time: from the start of its
 * opening day to the end of its deadline day. Dates are stored as instants, so
 * the calendar day is read in Asia/Manila, not in the server's time zone.
 */
const MANILA = 'Asia/Manila';

const manilaDay = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MANILA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const label = (day: string): string =>
  new Date(`${day}T12:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: MANILA, year: 'numeric', month: 'long', day: 'numeric' });

export const applicationWindow = (cycle: { startDate: Date; endDate: Date }) => {
  const opensDay = manilaDay(new Date(cycle.startDate));
  const closesDay = manilaDay(new Date(cycle.endDate));
  return {
    opensAt: new Date(`${opensDay}T00:00:00.000+08:00`),
    closesAt: new Date(`${closesDay}T23:59:59.999+08:00`),
    opensLabel: label(opensDay),
    closesLabel: label(closesDay),
  };
};

/** Whether `now` falls inside the window; status is checked separately. */
export const isWithinApplicationWindow = (cycle: { startDate: Date; endDate: Date }, now = new Date()): boolean => {
  const w = applicationWindow(cycle);
  return now >= w.opensAt && now <= w.closesAt;
};
