import { Chat } from "@/app/sessions/[id]/Chat";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  return <Chat sessionId={id} />;
}
