import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useLocalSearchParams } from "expo-router";

import { EmployeeDetailScreen } from "@/components/rh/employee-detail";

export default function FuncionarioScreen() {
  const { employeeId } = useLocalSearchParams<{ employeeId: string }>();
  return <EmployeeDetailScreen employeeId={employeeId as Id<"employees">} />;
}
