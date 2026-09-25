import { VerifyConsole } from "@/components/VerifyConsole";

type VerifyPageProps = {
  searchParams: Promise<{ position?: string }>;
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const params = await searchParams;
  const position = params.position === "defaulted" ? "defaulted" : "repaid";

  return (
    <main>
      <VerifyConsole initialPosition={position} />
    </main>
  );
}
