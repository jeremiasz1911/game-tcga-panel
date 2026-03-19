import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const result = await prisma.game.updateMany({
      where: {
        id,
        finished: false,
      },
      data: {
        finished: true,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Gra nie istnieje albo jest juz zakonczona.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Nie udalo sie zmienic statusu gry.",
      },
      { status: 500 },
    );
  }
}
