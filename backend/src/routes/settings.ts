import { Router } from "express";
import { getSettings, updateSettings } from "../config/env";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getSettings());
});

settingsRouter.post("/", (req, res) => {
  const { apifyApiUrl, apifyApiKey, aiApiUrl, aiApiKey, aiModel, resendApiKey, alertEmail } = req.body ?? {};

  const updated = updateSettings({
    apifyApiUrl: typeof apifyApiUrl === "string" ? apifyApiUrl : undefined,
    apifyApiKey: typeof apifyApiKey === "string" ? apifyApiKey : undefined,
    aiApiUrl: typeof aiApiUrl === "string" ? aiApiUrl : undefined,
    aiApiKey: typeof aiApiKey === "string" ? aiApiKey : undefined,
    aiModel: typeof aiModel === "string" ? aiModel : undefined,
    resendApiKey: typeof resendApiKey === "string" ? resendApiKey : undefined,
    alertEmail: typeof alertEmail === "string" ? alertEmail : undefined,
  });

  res.json({
    ok: true,
    message: "Settings updated successfully.",
    settings: updated,
  });
});
