"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Shield, Sparkles, Swords } from "lucide-react";
import { Button, Card, CardBody, Chip, Tab, Tabs } from "@heroui/react";
import type { DashboardOverview } from "@/lib/dashboard-data";

type GameShellProps = {
  overview: DashboardOverview;
};

const PIN_KEY = "tcga-pin-unlocked";
const PIN_VALUE = "1965";

const tokenCatalog = {
  swords: Swords,
  shield: Shield,
  sparkles: Sparkles,
  crown: Crown,
} as const;

function formatDate(value: string | null) {
  if (!value) {
    return "brak daty";
  }

  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "Brak danych";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return `${minutes}m ${seconds}s`;
}

export function GameShell({ overview }: GameShellProps) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const [pin, setPin] = useState("");
  const [dashboard, setDashboard] = useState(overview);
  const [localUnlocked, setLocalUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [shakeTick, setShakeTick] = useState(0);
  const [actionError, setActionError] = useState("");
  const [finishingIds, setFinishingIds] = useState<string[]>([]);
  const [historyDetailsId, setHistoryDetailsId] = useState<string | null>(null);

  const isUnlocked = localUnlocked;

  useEffect(() => {
    if (window.sessionStorage.getItem(PIN_KEY) === "true") {
      setLocalUnlocked(true);
    }
  }, []);

  const refreshOverview = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/overview", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const nextOverview = (await response.json()) as DashboardOverview;
      setDashboard(nextOverview);
    } catch {
      // Keep current values on transient network failures.
    }
  }, []);

  useEffect(() => {
    setDashboard(overview);
  }, [overview]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    void refreshOverview();

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refreshOverview();
    }, 15000);

    const handleFocus = () => {
      void refreshOverview();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshOverview();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isUnlocked, refreshOverview]);

  const pinReady = pin.length === 4;
  const pinSlots = useMemo(
    () => Array.from({ length: 4 }, (_, index) => pin[index] ?? ""),
    [pin],
  );

  const gameTokens = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => {
        const tokenNames = Object.keys(tokenCatalog) as Array<keyof typeof tokenCatalog>;

        return {
          id: `token-${index}`,
          left: `${(index * 11) % 100}%`,
          delay: `${(index % 9) * 0.75}s`,
          duration: `${11 + (index % 7)}s`,
          size: `${14 + (index % 5) * 4}px`,
          opacity: 0.12 + ((index % 6) * 0.08),
          rotate: `${(index % 10) * 8}deg`,
          token: tokenNames[index % tokenNames.length],
        };
      }),
    [],
  );

  const cards = useMemo(
    () => [
      {
        title: "Users",
        value: dashboard.totalUsers,
      },
      {
        title: "Rozegrane gry (wszystkie)",
        value: dashboard.totalGames,
      },
      {
        title: "Active (finished == 0)",
        value: dashboard.activeGames,
      },
      {
        title: "Historia (finished != 0)",
        value: dashboard.finishedGames,
      },
    ],
    [dashboard],
  );

  const onMouseMove: MouseEventHandler<HTMLElement> = (event) => {
    if (!sceneRef.current) {
      return;
    }

    const { clientX, clientY } = event;

    sceneRef.current.style.setProperty("--mouse-x", `${clientX}px`);
    sceneRef.current.style.setProperty("--mouse-y", `${clientY}px`);
  };

  const finishGame = async (id: string) => {
    if (finishingIds.includes(id)) {
      return;
    }

    setActionError("");
    setFinishingIds((prev) => [...prev, id]);

    try {
      const response = await fetch(`/api/games/${id}/finish`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Nie mozna zakonczyc gry");
      }

      setDashboard((prev) => {
        const gameToMove = prev.activeGameList.find((game) => game.id === id);

        return {
          ...prev,
          activeGames: Math.max(prev.activeGames - 1, 0),
          finishedGames: prev.finishedGames + 1,
          activeGameList: prev.activeGameList.filter((game) => game.id !== id),
          recentFinishedGames: gameToMove
            ? [
                {
                  id: gameToMove.id,
                  label: gameToMove.label,
                  createdAt: gameToMove.createdAt,
                  updatedAt: new Date().toISOString(),
                  winner: "Brak danych",
                  rounds: null,
                  durationSeconds: null,
                },
                ...prev.recentFinishedGames,
              ].slice(0, 20)
            : prev.recentFinishedGames,
        };
      });
    } catch {
      setActionError("Nie udalo sie oznaczyc gry jako zakonczonej.");
    } finally {
      setFinishingIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const tryUnlock = (candidate: string) => {
    if (candidate !== PIN_VALUE) {
      setShakeTick((value) => value + 1);
      setError("Niepoprawny PIN. Spróbuj ponownie.");
      setTimeout(() => {
        setPin("");
      }, 220);
      return;
    }

    setError("");
    setPin(candidate);
    setLocalUnlocked(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(PIN_KEY, "true");
    }
  };

  if (!isUnlocked) {
    return (
      <main
        ref={sceneRef}
        onMouseMove={onMouseMove}
        className="tcga-scene min-h-screen px-4 py-8 text-white sm:px-8 sm:py-16"
      >
        <div className="tcga-lava-backdrop" />
        <div className="tcga-city-backdrop" />
        <div className="tcga-fire-gif-backdrop" />
        <div className="tcga-cursor-glow" />
        <div className="tcga-gradient-orb tcga-gradient-orb-a" />
        <div className="tcga-gradient-orb tcga-gradient-orb-b" />
        <div className="tcga-gradient-orb tcga-gradient-orb-c" />
        <div className="tcga-token-layer" aria-hidden>
          {gameTokens.map((token) => {
            const Icon = tokenCatalog[token.token];

            return (
              <span
                key={token.id}
                className="tcga-game-token"
                style={{
                  left: token.left,
                  animationDelay: token.delay,
                  animationDuration: token.duration,
                  width: token.size,
                  height: token.size,
                  opacity: token.opacity,
                  transform: `rotate(${token.rotate})`,
                }}
              >
                <Icon size="100%" />
              </span>
            );
          })}
        </div>
        <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="w-full"
          >
            <Card className="w-full overflow-hidden rounded-[30px] border border-orange-200/30 bg-black/45 shadow-[0_24px_60px_rgba(251,146,60,0.22)] backdrop-blur-2xl">
              <CardBody className="relative gap-5 p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-orange-300/18 to-transparent" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
                  TCGA Secure Lobby
                </p>
                <h1 className="text-2xl font-semibold sm:text-3xl">Wejscie chronione PIN-em</h1>
                <p className="text-sm text-white/80">
                  Wpisz 4-cyfrowy kod, aby zalogowac sie do panelu gry.
                </p>

                <div
                  className="space-y-3"
                  onClick={() => {
                    pinInputRef.current?.focus();
                  }}
                >
                  <div className="relative">
                    <input
                      ref={pinInputRef}
                      aria-label="PIN"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={4}
                      value={pin}
                      onChange={(event) => {
                        setError("");
                        const nextPin = event.target.value.replace(/\D/g, "").slice(0, 4);

                        setPin(nextPin);

                        if (nextPin.length === 4) {
                          tryUnlock(nextPin);
                        }
                      }}
                      className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
                    />

                    <motion.div
                      className="grid grid-cols-4 gap-3"
                      animate={{
                        x: shakeTick ? [0, -8, 8, -5, 5, 0] : 0,
                      }}
                      transition={{ duration: 0.35 }}
                    >
                      {pinSlots.map((digit, index) => (
                        <motion.div
                          key={`pin-${index}`}
                          animate={{
                            scale: digit ? [1, 1.08, 1] : 1,
                            borderColor: digit ? "rgba(251, 146, 60, 0.95)" : "rgba(255, 255, 255, 0.35)",
                          }}
                          transition={{ duration: 0.2 }}
                          className="flex h-[3.75rem] items-center justify-center rounded-2xl border bg-black/45 text-xl font-bold text-white shadow-[inset_0_0_18px_rgba(251,146,60,0.14)]"
                        >
                          {digit ? "*" : ""}
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {pinSlots.map((digit, index) => (
                      <motion.div
                        key={`slot-${index}`}
                        animate={{
                          y: digit ? [0, -3, 0] : 0,
                          opacity: digit ? 1 : 0.35,
                        }}
                        transition={{ duration: 0.22 }}
                        className="h-1.5 rounded-full bg-gradient-to-r from-orange-300/85 to-red-300/85"
                      />
                    ))}
                  </div>
                </div>

                {error ? <p className="text-sm text-rose-300">{error}</p> : null}

                <Button
                  color="primary"
                  radius="full"
                  className="h-12 w-full bg-gradient-to-r from-amber-300 via-orange-300 to-red-300 text-base font-bold tracking-[0.03em] text-black shadow-[0_14px_30px_rgba(251,146,60,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(251,146,60,0.5)] active:translate-y-0 active:scale-[0.99]"
                  isDisabled={!pinReady}
                  onPress={() => {
                    tryUnlock(pin);
                  }}
                >
                  Zaloguj sie
                </Button>
               
              </CardBody>
            </Card>
          </motion.div>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={sceneRef}
      onMouseMove={onMouseMove}
      className="tcga-scene tcga-dashboard min-h-screen px-4 py-6 text-zinc-900 sm:px-8 sm:py-10"
    >
      <div className="tcga-lava-backdrop" />
      <div className="tcga-city-backdrop" />
      <div className="tcga-fire-gif-backdrop" />
      <div className="tcga-cursor-glow" />
      <div className="tcga-gradient-orb tcga-gradient-orb-a" />
      <div className="tcga-gradient-orb tcga-gradient-orb-b" />
      <div className="tcga-gradient-orb tcga-gradient-orb-c" />
      <div className="tcga-token-layer" aria-hidden>
        {gameTokens.map((token) => {
          const Icon = tokenCatalog[token.token];

          return (
            <span
              key={token.id}
              className="tcga-game-token"
              style={{
                left: token.left,
                animationDelay: token.delay,
                animationDuration: token.duration,
                width: token.size,
                height: token.size,
                opacity: token.opacity,
                transform: `rotate(${token.rotate})`,
              }}
            >
              <Icon size="100%" />
            </span>
          );
        })}
      </div>
      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/90">
              TCGA Control
            </p>
            <h1 className="text-3xl font-semibold text-orange-50 sm:text-4xl">Panel gry</h1>
          </div>
          <Chip
            color="warning"
            variant="shadow"
            className="gap-2 bg-orange-300/90 px-3 text-black shadow-[0_8px_20px_rgba(251,146,60,0.45)] white"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)] " />
            <span className="text-white/60 font-bold text-lg font-thin"> panel aktywny</span>
          </Chip>
        </header>

        <Tabs
          aria-label="Nawigacja panelu"
          color="warning"
          radius="lg"
          variant="solid"
          classNames={{
            tabList:
              "bg-black/50 border border-orange-300/35 rounded-[18px] overflow-hidden p-1 w-full sm:w-fit shadow-[0_8px_24px_rgba(251,146,60,0.24)]",
            tab: "cursor-pointer px-5 h-11 rounded-xl data-[hover=true]:bg-orange-200/15",
            tabContent: "text-orange-100 group-data-[selected=true]:text-black font-semibold",
            cursor: "rounded-xl bg-gradient-to-r from-amber-300 via-orange-300 to-red-300",
          }}
        >
          <Tab key="main" title="Główny">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {cards.map((card) => (
                <Card
                  key={card.title}
                  shadow="sm"
                  className="group overflow-hidden rounded-[28px] border border-orange-300/35 bg-black/45 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-orange-200/70 hover:shadow-[0_16px_44px_rgba(251,146,60,0.35)]"
                >
                  <CardBody className="relative gap-2 px-5 py-6">
                    <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-orange-400/20 blur-2xl transition-transform duration-300 group-hover:scale-125" />
                    <p className="text-xs uppercase tracking-[0.18em] text-orange-100/80">{card.title}</p>
                    <p className="tcga-metric-value text-5xl font-bold text-orange-50 transition-transform duration-300 group-hover:scale-105">
                      {card.value}
                    </p>
                    <p className="text-xs text-orange-100/60">LIVE STATS</p>
                  </CardBody>
                </Card>
              ))}
            </motion.div>
          </Tab>

          <Tab key="current" title="Obecne gry">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <Card className="rounded-[32px] border border-orange-300/30 bg-black/45 text-orange-50 backdrop-blur-2xl">
              <CardBody className="gap-3 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">Aktywne gry</h2>
                  <Chip size="sm" variant="flat" className="rounded-full border border-orange-200/40 bg-orange-300/20 px-2 text-orange-50">
                    Status: aktywna
                  </Chip>
                </div>
                <p className="text-sm text-orange-100/75">Liczba aktywnych: {dashboard.activeGames}</p>
                {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}
                {dashboard.activeGameList.length === 0 ? (
                  <p className="text-sm text-orange-100/75">Brak aktywnych gier.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {dashboard.activeGameList.map((game) => (
                      <li
                        key={game.id}
                        className="group flex flex-col gap-3 rounded-[24px] border border-orange-200/30 bg-black/35 px-4 py-4 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-200/70 hover:bg-black/55"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold text-orange-50">{game.label}</p>
                            <p className="text-xs text-orange-100/70">ID: {game.id}</p>
                          </div>
                          <Chip
                            size="sm"
                            variant="flat"
                            className="rounded-full border border-emerald-200/45 bg-emerald-300/20 px-2 text-emerald-100"
                          >
                            aktywna
                          </Chip>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-orange-100/80">Start: {formatDate(game.createdAt)}</p>
                          <Button
                            size="sm"
                            color="success"
                            radius="full"
                            className="cursor-pointer bg-gradient-to-r from-amber-300 via-orange-300 to-red-300 px-4 font-bold text-black shadow-[0_10px_22px_rgba(251,146,60,0.38)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(251,146,60,0.45)] active:translate-y-0 active:scale-[0.99]"
                            isLoading={finishingIds.includes(game.id)}
                            onPress={() => {
                              void finishGame(game.id);
                            }}
                          >
                            Zakoncz gre (finished = 1)
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
              </Card>
            </motion.div>
          </Tab>

          <Tab key="history" title="Historia gier">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <Card className="h-[72vh] min-h-[560px] max-h-[820px] rounded-[28px] border border-orange-300/30 bg-black/45 text-orange-50 backdrop-blur-2xl">
              <CardBody className="flex h-full gap-3 p-6">
                <h2 className="text-xl font-semibold">Statystyki poprzednich gier</h2>
                <p className="text-sm text-orange-100/75">Lacznie zakonczonych: {dashboard.finishedGames}</p>
                {dashboard.recentFinishedGames.length === 0 ? (
                  <p className="text-sm text-orange-100/75">
                    Brak historii. Po zakończeniu gier pojawią się tutaj wpisy.
                  </p>
                ) : (
                  <div className="tcga-history-wrap flex h-full min-h-0 flex-col space-y-3">
                    <div className="tcga-history-header hidden grid-cols-[2.2fr_1.2fr_0.7fr_0.9fr_1.2fr_0.8fr] items-center gap-3 rounded-xl border border-orange-300/25 bg-black/35 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-200/80 md:grid">
                      <span>Mecz</span>
                      <span>Zwyciezca</span>
                      <span>Tury</span>
                      <span>Czas</span>
                      <span>Koniec</span>
                      <span>Akcja</span>
                    </div>

                    <ul className="tcga-scroll-area min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {dashboard.recentFinishedGames.map((game) => {
                        const isSelected = game.id === historyDetailsId;

                        return (
                          <motion.li
                            key={game.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: 0.06 }}
                            layout
                            className={`grid gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-300 md:grid-cols-[2.2fr_1.2fr_0.7fr_0.9fr_1.2fr_0.8fr] md:items-center ${
                              isSelected
                                ? "border-orange-200/85 bg-orange-300/15 shadow-[0_0_0_1px_rgba(251,146,60,0.3)]"
                                : "border-orange-200/30 bg-black/35 hover:border-orange-200/70 hover:bg-black/55"
                            }`}
                          >
                            <div>
                              <p className="font-semibold text-orange-50">{game.label}</p>
                              <p className="text-xs text-orange-100/65">ID: {game.id}</p>
                            </div>
                            <div>
                              <Chip
                                size="sm"
                                color={game.winner === "Brak danych" ? "default" : "warning"}
                                variant="flat"
                              >
                                {game.winner}
                              </Chip>
                            </div>
                            <p className="text-orange-100/90">{game.rounds ?? "-"}</p>
                            <p className="text-orange-100/90">{formatDuration(game.durationSeconds)}</p>
                            <p className="text-orange-100/90">{formatDate(game.updatedAt)}</p>
                            <Button
                              size="sm"
                              variant="flat"
                              className={`cursor-pointer rounded-full px-4 font-semibold transition-all duration-250 ${
                                isSelected
                                  ? "bg-orange-300 text-black shadow-[0_8px_16px_rgba(251,146,60,0.35)]"
                                  : "bg-orange-200/20 text-orange-50 hover:-translate-y-0.5 hover:bg-orange-300/35 hover:shadow-[0_8px_16px_rgba(251,146,60,0.25)]"
                              }`}
                              onPress={() => {
                                setHistoryDetailsId((current) => (current === game.id ? null : game.id));
                              }}
                            >
                              {isSelected ? "Ukryj" : "Szczegoly"}
                            </Button>

                              <AnimatePresence initial={false}>
                              {isSelected ? (
                                <motion.div
                                  key={`${game.id}-details`}
                                  initial={{ opacity: 0, height: 0, y: -6 }}
                                  animate={{ opacity: 1, height: "auto", y: 0 }}
                                  exit={{ opacity: 0, height: 0, y: -4 }}
                                  transition={{ duration: 0.26, ease: "easeInOut" }}
                                  layout
                                  className="overflow-hidden md:col-span-6"
                                >
                                  <div className="rounded-xl border border-orange-300/55 bg-black/50 p-3 backdrop-blur-xl">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">
                                      Szczegoly gry
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Mecz</p>
                                        <p className="font-semibold">{game.label}</p>
                                      </div>
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Zwyciezca</p>
                                        <p className="font-semibold">{game.winner}</p>
                                      </div>
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Tury</p>
                                        <p className="font-semibold">{game.rounds ?? "Brak danych"}</p>
                                      </div>
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Czas gry</p>
                                        <p className="font-semibold">{formatDuration(game.durationSeconds)}</p>
                                      </div>
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Start</p>
                                        <p className="font-semibold">{formatDate(game.createdAt)}</p>
                                      </div>
                                      <div className="rounded-lg border border-orange-300/35 bg-black/35 p-3">
                                        <p className="text-xs text-orange-100/70">Koniec</p>
                                        <p className="font-semibold">{formatDate(game.updatedAt)}</p>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              ) : null}
                              </AnimatePresence>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardBody>
              </Card>
            </motion.div>
          </Tab>
        </Tabs>
      </section>
    </main>
  );
}
