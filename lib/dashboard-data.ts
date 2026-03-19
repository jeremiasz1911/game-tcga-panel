import { prisma } from "@/lib/prisma";

export type DashboardOverview = {
  totalUsers: number;
  totalGames: number;
  activeGames: number;
  finishedGames: number;
  activeGameList: {
    id: string;
    label: string;
    createdAt: string | null;
  }[];
  recentFinishedGames: {
    id: string;
    label: string;
    createdAt: string | null;
    updatedAt: string | null;
    winner: string;
    rounds: number | null;
    durationSeconds: number | null;
  }[];
};

function parseSerializedNumericField(state: string | null, fieldName: string) {
  if (!state) {
    return null;
  }

  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stringMatch = state.match(new RegExp(`${escapedFieldName}";s:\\d+:"(\\d+)";`));

  if (stringMatch?.[1]) {
    return Number.parseInt(stringMatch[1], 10);
  }

  const intMatch = state.match(new RegExp(`${escapedFieldName}";i:(\\d+);`));

  if (intMatch?.[1]) {
    return Number.parseInt(intMatch[1], 10);
  }

  return null;
}

function parseSerializedStringField(state: string | null, fieldName: string) {
  if (!state) {
    return null;
  }

  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stringMatch = state.match(new RegExp(`${escapedFieldName}";s:\\d+:"([^\"]+)";`));

  if (stringMatch?.[1]) {
    return stringMatch[1].trim();
  }

  return null;
}

function detectWinnerFromState(
  state: string | null,
  playerAName: string,
  playerBName: string,
  playerAId: bigint,
  playerBId: bigint,
) {
  const candidateWinnerIds = [
    parseSerializedNumericField(state, "winnerPlayerId"),
    parseSerializedNumericField(state, "winner_id"),
    parseSerializedNumericField(state, "winnerId"),
    parseSerializedNumericField(state, "winnerUserId"),
    parseSerializedNumericField(state, "winner_user_id"),
  ];

  for (const winnerPlayerId of candidateWinnerIds) {
    if (winnerPlayerId === null) {
      continue;
    }

    if (winnerPlayerId === Number(playerAId)) {
      return playerAName;
    }

    if (winnerPlayerId === Number(playerBId)) {
      return playerBName;
    }
  }

  const winnerString =
    parseSerializedStringField(state, "winner") ??
    parseSerializedStringField(state, "winnerName") ??
    parseSerializedStringField(state, "winner_name") ??
    parseSerializedStringField(state, "winnerSide") ??
    parseSerializedStringField(state, "winner_side");

  if (winnerString) {
    const normalizedWinner = winnerString.toLowerCase();
    const playerALower = playerAName.toLowerCase();
    const playerBLower = playerBName.toLowerCase();

    if (normalizedWinner === "a" || normalizedWinner === "player_a" || normalizedWinner === "playera") {
      return playerAName;
    }

    if (normalizedWinner === "b" || normalizedWinner === "player_b" || normalizedWinner === "playerb") {
      return playerBName;
    }

    if (normalizedWinner === playerALower) {
      return playerAName;
    }

    if (normalizedWinner === playerBLower) {
      return playerBName;
    }
  }

  if (!state) {
    return "Brak danych";
  }

  const text = state.toLowerCase();
  const playerALower = playerAName.toLowerCase();
  const playerBLower = playerBName.toLowerCase();

  // Use strict word boundaries so keys like "drawPile" don't get classified as a draw.
  if (/\b(remis|draw|tie)\b/.test(text)) {
    return "Remis";
  }

  const playerAIdText = playerAId.toString();
  const playerBIdText = playerBId.toString();

  const aWin =
    /"winner"\s*:\s*"?(a|player_a|playera)"?/.test(text) ||
    /"winner_side"\s*:\s*"?a"?/.test(text) ||
    (/"winner_id"\s*:\s*"?\d+"?/.test(text) && text.includes(playerAIdText)) ||
    /winner_a|player_a_win|playera_win/.test(text) ||
    text.includes(`"winner":"${playerALower}"`);

  const bWin =
    /"winner"\s*:\s*"?(b|player_b|playerb)"?/.test(text) ||
    /"winner_side"\s*:\s*"?b"?/.test(text) ||
    (/"winner_id"\s*:\s*"?\d+"?/.test(text) && text.includes(playerBIdText)) ||
    /winner_b|player_b_win|playerb_win/.test(text) ||
    text.includes(`"winner":"${playerBLower}"`);

  if (aWin && !bWin) {
    return playerAName;
  }

  if (bWin && !aWin) {
    return playerBName;
  }

  return "Brak danych";
}

function calcDurationSeconds(createdAt: Date | null, updatedAt: Date | null) {
  if (!createdAt || !updatedAt) {
    return null;
  }

  const diff = Math.floor((updatedAt.getTime() - createdAt.getTime()) / 1000);

  if (diff < 0) {
    return null;
  }

  return diff;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || !/^mysqls?:\/\//.test(databaseUrl)) {
    return {
      totalUsers: 0,
      totalGames: 0,
      activeGames: 0,
      finishedGames: 0,
      activeGameList: [],
      recentFinishedGames: [],
    };
  }

  try {
    const [
      totalUsers,
      totalGames,
      activeGames,
      finishedGames,
      activeGameList,
      recentFinishedGames,
    ] =
      await prisma.$transaction([
        prisma.user.count(),
        prisma.game.count(),
        prisma.game.count({ where: { finished: false } }),
        prisma.game.count({ where: { finished: true } }),
        prisma.game.findMany({
          where: { finished: false },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            playerA: {
              select: {
                username: true,
              },
            },
            playerB: {
              select: {
                username: true,
              },
            },
          },
        }),
        prisma.game.findMany({
          where: { finished: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            state: true,
            createdAt: true,
            updatedAt: true,
            playerAId: true,
            playerBId: true,
            playerA: {
              select: {
                username: true,
              },
            },
            playerB: {
              select: {
                username: true,
              },
            },
          },
        }),
      ]);

    return {
      totalUsers,
      totalGames,
      activeGames,
      finishedGames,
      activeGameList: activeGameList.map((game) => ({
        id: game.id,
        label: `${game.playerA.username} vs ${game.playerB.username}`,
        createdAt: game.createdAt?.toISOString() ?? null,
      })),
      recentFinishedGames: recentFinishedGames.map((game) => ({
        id: game.id,
        label: `${game.playerA.username} vs ${game.playerB.username}`,
        createdAt: game.createdAt?.toISOString() ?? null,
        updatedAt: game.updatedAt?.toISOString() ?? null,
        winner: detectWinnerFromState(
          game.state,
          game.playerA.username,
          game.playerB.username,
          game.playerAId,
          game.playerBId,
        ),
        rounds: parseSerializedNumericField(game.state, "turn"),
        durationSeconds: calcDurationSeconds(game.createdAt, game.updatedAt),
      })),
    };
  } catch {
    // If the DB or migration is not ready yet, keep the app usable with empty placeholders.
    return {
      totalUsers: 0,
      totalGames: 0,
      activeGames: 0,
      finishedGames: 0,
      activeGameList: [],
      recentFinishedGames: [],
    };
  }
}
