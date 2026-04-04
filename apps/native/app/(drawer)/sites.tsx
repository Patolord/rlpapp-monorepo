import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Pencil, Trash2, Lock } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SitesScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <SitesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">Faça login para acessar</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4"><ButtonText>Entrar</ButtonText></Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" /></View>
      </AuthLoading>
    </Container>
  );
}

function SitesContent() {
  const sites = useQuery(api.sites.list, {});
  const createSite = useMutation(api.sites.create);
  const updateSite = useMutation(api.sites.update);
  const removeSite = useMutation(api.sites.remove);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    responsibleName: "",
    responsiblePhone: "",
  });

  const resetForm = () => {
    setFormData({ name: "", address: "", responsibleName: "", responsiblePhone: "" });
  };

  const handleCreate = async () => {
    try {
      await createSite({
        name: formData.name,
        address: formData.address || undefined,
        responsibleName: formData.responsibleName || undefined,
        responsiblePhone: formData.responsiblePhone || undefined,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao criar site");
    }
  };

  const handleUpdate = async () => {
    if (!editingSite) return;
    try {
      await updateSite({
        id: editingSite._id,
        name: formData.name,
        address: formData.address || undefined,
        responsibleName: formData.responsibleName || undefined,
        responsiblePhone: formData.responsiblePhone || undefined,
      });
      setEditingSite(null);
      resetForm();
    } catch (error) {
      Alert.alert("Erro", "Erro ao atualizar site");
    }
  };

  const handleDelete = (id: any) => {
    Alert.alert("Confirmar", "Deseja realmente desativar este site?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desativar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeSite({ id });
          } catch (error) {
            Alert.alert("Erro", "Erro ao desativar site");
          }
        },
      },
    ]);
  };

  const openEdit = (site: any) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      address: site.address || "",
      responsibleName: site.responsibleName || "",
      responsiblePhone: site.responsiblePhone || "",
    });
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-foreground">Sites</Text>
          <Text className="text-muted-foreground text-sm">Gerencie os locais de entrega</Text>
        </View>
        <Button onPress={() => { resetForm(); setIsCreateOpen(true); }}>
          <View className="flex-row items-center gap-1">
            <Plus size={16} color="#fff" />
            <ButtonText>Novo</ButtonText>
          </View>
        </Button>
      </View>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Novo Site</DialogTitle>
          <DialogDescription>Preencha os dados do local de entrega</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome do Site</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Endereço</Label>
            <Input value={formData.address} onChangeText={(t) => setFormData((f) => ({ ...f, address: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Responsável</Label>
              <Input value={formData.responsibleName} onChangeText={(t) => setFormData((f) => ({ ...f, responsibleName: t }))} />
            </View>
            <View className="flex-1 gap-1">
              <Label>Telefone</Label>
              <Input value={formData.responsiblePhone} onChangeText={(t) => setFormData((f) => ({ ...f, responsiblePhone: t }))} keyboardType="phone-pad" />
            </View>
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setIsCreateOpen(false)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleCreate}><ButtonText>Criar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingSite} onOpenChange={(open) => !open && setEditingSite(null)}>
        <DialogHeader>
          <DialogTitle>Editar Site</DialogTitle>
          <DialogDescription>Atualize os dados do local de entrega</DialogDescription>
        </DialogHeader>
        <View className="gap-3 mt-3">
          <View className="gap-1">
            <Label>Nome do Site</Label>
            <Input value={formData.name} onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))} />
          </View>
          <View className="gap-1">
            <Label>Endereço</Label>
            <Input value={formData.address} onChangeText={(t) => setFormData((f) => ({ ...f, address: t }))} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Label>Responsável</Label>
              <Input value={formData.responsibleName} onChangeText={(t) => setFormData((f) => ({ ...f, responsibleName: t }))} />
            </View>
            <View className="flex-1 gap-1">
              <Label>Telefone</Label>
              <Input value={formData.responsiblePhone} onChangeText={(t) => setFormData((f) => ({ ...f, responsiblePhone: t }))} keyboardType="phone-pad" />
            </View>
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingSite(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button onPress={handleUpdate}><ButtonText>Salvar</ButtonText></Button>
        </DialogFooter>
      </Dialog>

      <Card>
        <CardHeader><CardTitle>Lista de Sites</CardTitle></CardHeader>
        <CardContent>
          {!sites ? (
            <ActivityIndicator />
          ) : sites.length === 0 ? (
            <Text className="text-muted-foreground">Nenhum site cadastrado</Text>
          ) : (
            <View className="gap-3">
              {sites.map((site) => (
                <View key={site._id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{site.name}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {site.address || "Sem endereço"} • {site.responsibleName || "Sem responsável"}
                    </Text>
                    {site.responsiblePhone ? (
                      <Text className="text-muted-foreground text-xs mt-0.5">{site.responsiblePhone}</Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={site.isActive ? "success" : "secondary"}>
                      {site.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Pressable onPress={() => openEdit(site)} className="p-2">
                      <Pencil size={16} color="#666" />
                    </Pressable>
                    {site.isActive && (
                      <Pressable onPress={() => handleDelete(site._id)} className="p-2">
                        <Trash2 size={16} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
