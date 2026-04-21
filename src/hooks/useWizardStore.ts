"use client";

import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  CampaignFormData,
  AdSquadFormData,
  CreativeFormData,
  SubmissionResults,
  SubmissionStatus,
  SubmissionStage,
} from "@/types/wizard";
import type { CampaignPreset } from "@/types/preset";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ensureFutureDate(date: string): string {
  return date < todayIso() ? todayIso() : date;
}

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

  duplicateCampaign: (id: string) => void;
  duplicateAdSquad: (id: string) => void;
  duplicateCreative: (id: string) => void;
  loadPreset: (preset: CampaignPreset) => void;
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

export const useWizardStore = create<WizardStore>((set, get) => ({
  ...initialState,

  setAdAccountId: (id) =>
    set((state) =>
      state.adAccountId === id
        ? {}
        : { ...initialState, adAccountId: id }
    ),
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
  reset: () => set((state) => ({ ...initialState, adAccountId: state.adAccountId })),

  duplicateCampaign: (id) => {
    const { campaigns } = get();
    const item = campaigns.find((c) => c.id === id);
    if (!item) return;
    const clone = structuredClone(item);
    clone.id = uuid();
    set({ campaigns: [...campaigns, clone] });
  },

  duplicateAdSquad: (id) => {
    const { adSquads } = get();
    const item = adSquads.find((s) => s.id === id);
    if (!item) return;
    const clone = structuredClone(item);
    clone.id = uuid();
    set({ adSquads: [...adSquads, clone] });
  },

  duplicateCreative: (id) => {
    const { creatives } = get();
    const item = creatives.find((c) => c.id === id);
    if (!item) return;
    const clone = structuredClone(item);
    clone.id = uuid();
    // Reset media state — each creative needs its own file and upload
    clone.mediaId = undefined;
    clone.mediaFile = undefined;
    clone.mediaFileName = undefined;
    clone.mediaPreviewUrl = undefined;
    clone.uploadStatus = "idle";
    set({ creatives: [...creatives, clone] });
  },

  loadPreset: (preset) => {
    const newCampaignId = uuid();
    const campaignData = preset.campaign;

    const campaign: CampaignFormData = {
      id: newCampaignId,
      name: "",
      objective: campaignData.objective,
      status: campaignData.status,
      startDate: campaignData.startDate ? ensureFutureDate(campaignData.startDate) : todayIso(),
      endDate: campaignData.endDate ? ensureFutureDate(campaignData.endDate) : undefined,
      spendCapType: campaignData.spendCapType,
      dailyBudgetUsd: campaignData.dailyBudgetUsd,
      lifetimeBudgetUsd: campaignData.lifetimeBudgetUsd,
    };

    const adSquads: AdSquadFormData[] = preset.adSquads.map((sq) => ({
      id: uuid(),
      campaignId: newCampaignId,
      name: "",
      type: sq.type,
      geoCountryCode: sq.geoCountryCode,
      optimizationGoal: sq.optimizationGoal,
      bidStrategy: sq.bidStrategy,
      bidAmountUsd: sq.bidAmountUsd,
      spendCapType: sq.spendCapType,
      dailyBudgetUsd: sq.dailyBudgetUsd,
      lifetimeBudgetUsd: sq.lifetimeBudgetUsd,
      status: sq.status,
      startDate: sq.startDate ? ensureFutureDate(sq.startDate) : undefined,
      endDate: sq.endDate ? ensureFutureDate(sq.endDate) : undefined,
      placementConfig: sq.placementConfig,
      targetingGender: sq.targetingGender,
      targetingDeviceType: sq.targetingDeviceType,
      targetingOsType: sq.targetingOsType,
      pixelId: sq.pixelId || undefined,
    }));

    set({ campaigns: [campaign], adSquads, creatives: [] });
  },
}));
