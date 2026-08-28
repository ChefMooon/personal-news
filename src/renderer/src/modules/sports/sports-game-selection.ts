import type { SportEvent } from "../../../../shared/ipc-types";
import { isSportEventOnLocalDate } from "../../../../shared/sports-event-utils";

export function getEligibleTodayGames(
  events: SportEvent[],
  today: string,
): SportEvent[] {
  return events.filter((event) =>
    isSportEventOnLocalDate(event.eventDate, event.eventTime, today),
  );
}

export function getSelectedTodayGame(
  games: SportEvent[],
  selectedGameId: string | null,
): SportEvent | null {
  return (
    games.find((game) => game.eventId === selectedGameId) ?? games[0] ?? null
  );
}
