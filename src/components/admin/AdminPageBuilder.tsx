/**
 * AdminPageBuilder — PROTÓTIPO, SEM PERSISTÊNCIA.
 *
 * ⚠️ NÃO ROTEADO de propósito. O `save()` abaixo apenas valida o JSON e emite
 * "Configuração salva com sucesso!" — nada é gravado. Enquanto esteve em
 * /dashboard/admin/pages, um admin podia montar um layout inteiro, ver a
 * confirmação de sucesso e perder tudo.
 *
 * Foi retirado da rota e do menu até o ciclo de CMS (§6) lhe dar um store real.
 * A escolha do store precisa ser feita junto com AdminSiteConfig e
 * AdminFullSiteEditor para não criar um TERCEIRO editor de página concorrente.
 *
 * Ao religar: substituir o save() por escrita real + preview e restaurar a rota
 * em Dashboard.tsx e o item em adminNav.tsx.
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Save, Plus, Trash2, Eye } from "lucide-react";
import { JsonField } from "./site-config/shared";
import { toast } from "sonner";

export default function AdminPageBuilder() {
  const [pageConfig, setPageConfig] = useState(JSON.stringify({
    sections: [
      { id: "hero", type: "hero", props: { title: "Bem-vindo" } }
    ]
  }, null, 2));

  const save = () => {
    try {
      JSON.parse(pageConfig);
      toast.success("Configuração salva com sucesso!");
    } catch (e) {
      toast.error("JSON inválido");
    }
  };

  return (
    <DashboardLayout title="Editor de Páginas" nav={getAdminNav("pages")}>
      <div className="space-y-6 pb-24 md:pb-8">
        <AdminPageHeader
          icon={LayoutGrid}
          eyebrow="CMS"
          title="Editor de Páginas"
          description="Crie e ajuste a estrutura de páginas complexas usando JSON de configuração."
          accent="from-indigo-500 to-purple-600"
          actions={
            <Button size="sm" onClick={save} className="gap-2">
              <Save className="w-4 h-4" /> Salvar Layout
            </Button>
          }
        />

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="h-[600px] flex flex-col">
            <CardContent className="p-4 flex flex-col h-full">
              <h2 className="text-sm font-bold mb-3">Estrutura (JSON)</h2>
              <div className="flex-1">
                <JsonField 
                  value={pageConfig} 
                  onChange={setPageConfig} 
                  placeholder='{"sections": []}' 
                  minH="500px" 
                />
              </div>
            </CardContent>
          </Card>

          <Card className="h-[600px] flex flex-col bg-muted/20">
            <CardContent className="p-4 flex flex-col h-full items-center justify-center">
              <Eye className="w-12 h-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">Preview dinâmico em desenvolvimento</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
