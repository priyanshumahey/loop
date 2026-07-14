import { notFound, redirect } from "next/navigation";

import { EventDetail } from "@/components/cal/event-detail";
import { Toaster } from "@/components/ui/sonner";
import { getEventById } from "@/lib/db/events";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const result = await getEventById(id);

  if (!result.success) {
    if (result.error === "Unauthorized") redirect("/auth/login");
    notFound();
  }

  return (
    <>
      <EventDetail event={result.data} />
      <Toaster />
    </>
  );
}
