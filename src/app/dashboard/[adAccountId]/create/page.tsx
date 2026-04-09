import { WizardShell } from "@/components/wizard/WizardShell";

interface Props {
  params: { adAccountId: string };
}

export default function CreatePage({ params }: Props) {
  return <WizardShell adAccountId={params.adAccountId} />;
}
