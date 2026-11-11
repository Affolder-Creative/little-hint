export function EventDate({ date }: { date: string }) {
  return (
    <time dateTime={date}>
      {new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${date}T00:00:00Z`))}
    </time>
  );
}
