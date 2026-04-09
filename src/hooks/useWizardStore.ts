"use client";

import { create } from "zustand";
import type {
  CampaignFormData,
  AdSquadFormData,
  CreativeFormData,
  SubmissionResults,
  SubmissionStatus,
  SubmissionStage,
} from "@/types/wizard";

interface WizardStore {
  currentStep: 1 | 2 | 3 | 4;
  adAccountId: string;
  campaigns: CampaignFormData[];
  adSquads: AdSquadFormData[];
  creatives: CreativeFormData[];
  submissionStatus: SubmissionStatus;
  submissionStage: SubmissionStage | null;
  submissionResults: SubmissionResults | null;

  setAdAccountId: (id: string) => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  setCampaigns: (data: CampaignFormData[]) => void;
  setAdSquads: (data: AdSquadFormData[]) => void;
  setCreatives: (data: CreativeFormData[]) => void;
  updateCreative: (id: string, patch: Partial<CreativeFormData>) => void;
  setSubmissionStatus: (status: SubmissionStatus) => void;
  setSubmissionStage: (stage: SubmissionStage | null) => void;
  setSubmissionResults: (results: SubmissionResults) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 1 as const,
  adAccountId: "",
  campaigns: [],
  adSquads: [],
  creatives: [],
  submissionStatus: "idle" as SubmissionStatus,
  submissionStage: null as SubmissionStage | null,
  submissionResults: null as SubmissionResults | null,
};

export const useWizardStore = create<WizardStore>((set) => ({
  ...initialState,

  setAdAccountId: (id) => set({ adAccountId: id }),
  setStep: (step) => set({ currentStep: step }),
  setCampaigns: (campaigns) => set({ campaigns }),
  setAdSquads: (adSquads) => set({ adSquads }),
  setCreatives: (creatives) => set({ creatives }),
  updateCreative: (id, patch) =>
    set((state) => ({
      creatives: state.creatives.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  setSubmissionStatus: (submissionStatus) => set({ submissionStatus }),
  setSubmissionStage: (submissionStage) => set({ submissionStage }),
  setSubmissionResults: (submissionResults) => set({ submissionResults }),
  reset: () => set(initialState),
}));
