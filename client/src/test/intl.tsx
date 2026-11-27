/* Test i18n wrapper with every message namespace (forms now pull from
   `validation` and `common` as well as their feature namespace). */
import React from "react";
import { NextIntlClientProvider } from "next-intl";
import agents from "../../messages/en/agents.json";
import common from "../../messages/en/common.json";
import conventions from "../../messages/en/conventions.json";
import onboarding from "../../messages/en/onboarding.json";
import prIntent from "../../messages/en/prIntent.json";
import prReview from "../../messages/en/prReview.json";
import settings from "../../messages/en/settings.json";
import shell from "../../messages/en/shell.json";
import skills from "../../messages/en/skills.json";
import validation from "../../messages/en/validation.json";

export const testMessages = { agents, common, conventions, onboarding, prIntent, prReview, settings, shell, skills, validation };

export function IntlWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={testMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
