import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button, Chip, Divider, Spinner, Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignOutButton } from "@/components/sign-out-button";

export default function Home() {
  const { user } = useUser();
  const healthCheck = useQuery(api.healthCheck.get);
  const privateData = useQuery(api.privateData.get);
  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");

  const isConnected = healthCheck === "OK";
  const isLoading = healthCheck === undefined;

  return (
    <Container className="p-4">
      <View className="py-6 mb-4">
        <Text className="text-3xl font-semibold text-foreground tracking-tight">
          Better T Stack
        </Text>
        <Text className="text-muted text-sm mt-1">Full-stack TypeScript starter</Text>
      </View>

      <Surface variant="secondary" className="p-4 rounded-lg">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-foreground font-medium">System Status</Text>
          <Chip variant="secondary" color={isConnected ? "success" : "danger"} size="sm">
            <Chip.Label>{isConnected ? "LIVE" : "OFFLINE"}</Chip.Label>
          </Chip>
        </View>

        <Divider className="mb-3" />

        <Surface variant="tertiary" className="p-3 rounded-md">
          <View className="flex-row items-center">
            <View
              className={`w-2 h-2 rounded-full mr-3 ${isConnected ? "bg-success" : "bg-muted"}`}
            />
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">Convex Backend</Text>
              <Text className="text-muted text-xs mt-0.5">
                {isLoading
                  ? "Checking connection..."
                  : isConnected
                    ? "Connected to API"
                    : "API Disconnected"}
              </Text>
            </View>
            {isLoading && <Spinner size="sm" />}
            {!isLoading && isConnected && (
              <Ionicons name="checkmark-circle" size={18} color={successColor} />
            )}
            {!isLoading && !isConnected && (
              <Ionicons name="close-circle" size={18} color={dangerColor} />
            )}
          </View>
        </Surface>
      </Surface>

      <Authenticated>
        <Surface variant="secondary" className="mt-4 p-4 rounded-lg">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-foreground font-medium">
                {user?.emailAddresses[0].emailAddress}
              </Text>
              <Text className="text-muted text-xs mt-0.5">Private: {privateData?.message}</Text>
            </View>
            <SignOutButton />
          </View>
        </Surface>
      </Authenticated>
      <Unauthenticated>
        <View className="mt-4 gap-3">
          <Link href="/(auth)/sign-in" asChild>
            <Button variant="secondary">
              <Button.Label>Sign In</Button.Label>
            </Button>
          </Link>
          <Link href="/(auth)/sign-up" asChild>
            <Button variant="ghost">
              <Button.Label>Sign Up</Button.Label>
            </Button>
          </Link>
        </View>
      </Unauthenticated>
      <AuthLoading>
        <View className="mt-4 items-center">
          <Spinner size="sm" />
        </View>
      </AuthLoading>
    </Container>
  );
}
