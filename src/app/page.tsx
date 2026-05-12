import { Screen } from "@/components/screen";
import { TodayHeader } from "@/components/today/header";
import { SleepCard } from "@/components/today/sleep-card";
import { MorningBriefing } from "@/components/today/morning-briefing";
import { MorningRoutine } from "@/components/today/morning-routine";
import { EveningRoutine } from "@/components/today/evening-routine";
import { Goals } from "@/components/today/goals";
import { ReflectionCard } from "@/components/today/reflection";
import { WeeklyReviewCard } from "@/components/today/weekly-review-card";
import { PatternCard } from "@/components/today/pattern-card";

export default function Page() {
  return (
    <Screen>
      <MorningBriefing />
      <TodayHeader />
      <WeeklyReviewCard />
      <PatternCard />
      <SleepCard />
      <MorningRoutine />
      <Goals />
      <EveningRoutine />
      <ReflectionCard />
    </Screen>
  );
}
