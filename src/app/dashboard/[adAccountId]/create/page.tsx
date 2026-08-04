import { WizardShell } from "@/components/wizard/WizardShell";

// `params` became a Promise in Next 15 and Next 16 removed the synchronous fallback
// entirely. Reading `params.adAccountId` directly now yields undefined rather than
// throwing, so the wizard would quietly load with no ad account selected.
interface Props {
  params: Promise<{ adAccountId: string }>;
}

export default async function CreatePage({ params }: Props) {
  const { adAccountId } = await params;
  return <WizardShell adAccountId={adAccountId} />;
}
