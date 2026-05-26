"use client";

import { useState, useEffect } from "react";
import { Settings, X, Key, Database, Users, Cpu, Shield, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AppConfig,
  ModelConfig,
  loadConfig,
  saveConfig,
  getActiveModel,
  validateModelConfig,
  exportConfig,
  importConfig,
  resetConfig,
} from "@/lib/config/store";
import { LLMProvider } from "@/lib/llm/client";

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange?: (config: AppConfig) => void;
}

type Tab = "api" | "world" | "agents" | "features" | "advanced";

export function ConfigPanel({ isOpen, onClose, onConfigChange }: ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("api");
  const [config, setConfig] = useState<AppConfig>(loadConfig());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isCreating, setIsCreating] = useState(false);

  // Load config on mount
  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const updateConfig = (updates: Partial<AppConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    saveConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const updateModel = (modelId: string, updates: Partial<ModelConfig>) => {
    const models = config.models.map((m) =>
      m.id === modelId ? { ...m, ...updates } : m
    );
    updateConfig({ models });

    const model = models.find((m) => m.id === modelId);
    if (model) {
      setErrors({ ...errors, [modelId]: validateModelConfig(model) });
    }
  };

  const addModel = () => {
    const newModel: ModelConfig = {
      id: `model-${Date.now()}`,
      name: "New Model",
      provider: "ollama",
      model: "qwen2.5:14b",
      baseUrl: "http://localhost:11434/v1",
      enabled: false,
    };
    updateConfig({ models: [...config.models, newModel] });
  };

  const removeModel = (modelId: string) => {
    if (config.models.length <= 1) return;
    const models = config.models.filter((m) => m.id !== modelId);
    updateConfig({ models });
  };

  const handleCreateWorld = async () => {
    setIsCreating(true);
    try {
      const activeModel = getActiveModel(config);
      if (!activeModel) {
        alert("请先配置并启用至少一个模型");
        return;
      }

      const response = await fetch("/api/world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "新世界",
          worldId: "default-world",
          eraPackId: "18th_england",
          population: config.maxAgents,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("World created:", data);
        alert(`世界创建成功！已生成 ${config.maxAgents} 个居民`);
      } else {
        const error = await response.json();
        alert(`创建失败: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to create world:", error);
      alert("创建世界时出错");
    } finally {
      setIsCreating(false);
    }
  };

  const exportToFile = () => {
    const blob = new Blob([exportConfig(config)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pixel-town-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imported = importConfig(event.target?.result as string);
          if (imported) {
            setConfig(imported);
            saveConfig(imported);
            onConfigChange?.(imported);
            alert("配置导入成功");
          } else {
            alert("配置导入失败");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const tabs = [
    { id: "api" as Tab, label: "API 设置", icon: Key },
    { id: "world" as Tab, label: "世界设置", icon: Globe },
    { id: "agents" as Tab, label: "居民管理", icon: Users },
    { id: "features" as Tab, label: "功能开关", icon: Cpu },
    { id: "advanced" as Tab, label: "高级设置", icon: Shield },
  ];

  const eraPacks = [
    { value: "18th_england", label: "18世纪末英国乡村" },
    { value: "song_dynasty", label: "北宋汴梁市井" },
    { value: "1950s_usa", label: "1950年代美国小镇" },
    { value: "mars_2080", label: "2080火星殖民地" },
    { value: "edo_japan", label: "江户时代日本宿场町" },
  ];

  const activeModel = getActiveModel(config);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[480px] bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="font-semibold">配置面板</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors flex-1 whitespace-nowrap",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-120px)]">
          {activeTab === "api" && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                API Key 仅存储在浏览器本地，不会发送到任何服务器。
              </div>

              {/* Default Model */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  默认模型
                </label>
                <select
                  value={config.defaultModelId}
                  onChange={(e) => updateConfig({ defaultModelId: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  {config.models
                    .filter((m) => m.enabled)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
                {activeModel && (
                  <p className="text-xs text-muted-foreground mt-1">
                    当前: {activeModel.provider} / {activeModel.model}
                  </p>
                )}
              </div>

              {/* Model List */}
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-medium text-sm">模型配置</h4>
                {config.models.map((model) => (
                  <div key={model.id} className="p-3 bg-muted rounded-md space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={(e) =>
                          updateModel(model.id, { enabled: e.target.checked })
                        }
                        className="w-4 h-4"
                      />
                      <input
                        value={model.name}
                        onChange={(e) =>
                          updateModel(model.id, { name: e.target.value })
                        }
                        className="flex-1 px-2 py-1 text-sm bg-background rounded border"
                      />
                      <button
                        onClick={() => removeModel(model.id)}
                        disabled={config.models.length <= 1}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={model.provider}
                        onChange={(e) =>
                          updateModel(model.id, {
                            provider: e.target.value as LLMProvider,
                          })
                        }
                        className="px-2 py-1 text-sm bg-background rounded border"
                      >
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="ollama">Ollama</option>
                      </select>
                      <input
                        value={model.model}
                        onChange={(e) =>
                          updateModel(model.id, { model: e.target.value })
                        }
                        className="px-2 py-1 text-sm bg-background rounded border"
                        placeholder="模型名称"
                      />
                    </div>

                    {model.provider !== "ollama" && (
                      <input
                        type="password"
                        value={model.apiKey || ""}
                        onChange={(e) =>
                          updateModel(model.id, { apiKey: e.target.value })
                        }
                        className="w-full px-2 py-1 text-sm bg-background rounded border"
                        placeholder="API Key"
                      />
                    )}

                    {model.provider === "ollama" && (
                      <input
                        value={model.baseUrl || ""}
                        onChange={(e) =>
                          updateModel(model.id, { baseUrl: e.target.value })
                        }
                        className="w-full px-2 py-1 text-sm bg-background rounded border"
                        placeholder="http://localhost:11434/v1"
                      />
                    )}

                    {errors[model.id]?.length > 0 && (
                      <div className="text-xs text-red-500">
                        {errors[model.id].map((e) => (
                          <div key={e}>{e}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={addModel}
                  className="w-full py-2 border-2 border-dashed border-border rounded-md text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                >
                  + 添加模型
                </button>
              </div>

              {/* Embeddings */}
              <div className="pt-4 border-t">
                <h4 className="font-medium text-sm mb-3">向量嵌入</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={config.embeddingProvider}
                    onChange={(e) =>
                      updateConfig({
                        embeddingProvider: e.target.value as "ollama" | "openai",
                      })
                    }
                    className="px-3 py-2 rounded-md border border-input bg-background"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                  </select>
                  <input
                    value={config.embeddingModel}
                    onChange={(e) =>
                      updateConfig({ embeddingModel: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-input bg-background"
                    placeholder="nomic-embed-text"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "world" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  时代包
                </label>
                <select className="w-full px-3 py-2 rounded-md border border-input bg-background">
                  {eraPacks.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Tick 频率 (Hz): {config.tickRateHz}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={config.tickRateHz}
                  onChange={(e) =>
                    updateConfig({ tickRateHz: Number(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>慢</span>
                  <span>快</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  游戏分钟/Tick: {config.gameMinutesPerTick}
                </label>
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={config.gameMinutesPerTick}
                  onChange={(e) =>
                    updateConfig({ gameMinutesPerTick: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </div>

              <button
                onClick={handleCreateWorld}
                disabled={isCreating}
                className={cn(
                  "w-full px-4 py-2 rounded-md font-medium transition-colors",
                  isCreating
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {isCreating ? "创建中..." : "创建世界"}
              </button>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  最大居民数: {config.maxAgents}
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={config.maxAgents}
                  onChange={(e) =>
                    updateConfig({ maxAgents: Number(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>5</span>
                  <span>100</span>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-md">
                <h4 className="font-medium text-sm mb-1">当前居民: 0/{config.maxAgents}</h4>
                <p className="text-xs text-muted-foreground">
                  自动生成基于时代包的职业分布
                </p>
              </div>

              <button className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/80 transition-colors">
                + 自动生成 5 个居民
              </button>

              <div className="border-t border-border pt-4">
                <h4 className="font-medium text-sm mb-2">描述生成单个居民</h4>
                <textarea
                  placeholder="例如：一个酗酒的退伍士兵，瘸腿，对教士有偏见..."
                  className="w-full px-3 py-2 rounded-md border border-input bg-background min-h-[80px]"
                />
                <button className="w-full mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors">
                  生成并添加
                </button>
              </div>
            </div>
          )}

          {activeTab === "features" && (
            <div className="space-y-3">
              {[
                {
                  key: "enableVectorSearch" as const,
                  label: "向量语义搜索",
                  desc: "使用嵌入向量进行记忆检索",
                },
                {
                  key: "enableReflections" as const,
                  label: "Agent 反思",
                  desc: "Agent 会定期反思自己的经历",
                },
                {
                  key: "enableDialogue" as const,
                  label: "Agent 对话",
                  desc: "Agent 之间可以相互对话",
                },
                {
                  key: "enableWorldEvents" as const,
                  label: "世界事件",
                  desc: "随机发生影响世界的事件",
                },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 bg-muted rounded-md"
                >
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) =>
                      updateConfig({ [key]: e.target.checked } as Partial<AppConfig>)
                    }
                    className="w-5 h-5"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <div className="font-medium text-sm">请求频率限制</div>
                  <div className="text-xs text-muted-foreground">
                    控制 API 调用频率以管理成本
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.enableRateLimiting}
                  onChange={(e) =>
                    updateConfig({ enableRateLimiting: e.target.checked })
                  }
                  className="w-5 h-5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  每分钟最大请求: {config.maxLLMCallsPerMinute}
                </label>
                <input
                  type="range"
                  min="5"
                  max="200"
                  value={config.maxLLMCallsPerMinute}
                  onChange={(e) =>
                    updateConfig({ maxLLMCallsPerMinute: Number(e.target.value) })
                  }
                  disabled={!config.enableRateLimiting}
                  className="w-full disabled:opacity-50"
                />
              </div>

              {/* I1: fal.ai API Key */}
              <div className="pt-4 border-t">
                <label className="block text-sm font-medium mb-2">
                  fal.ai API Key <span className="text-xs text-muted-foreground">(用于AI肖像生成)</span>
                </label>
                <input
                  type="password"
                  placeholder="输入 fal.ai API Key"
                  value={config.falApiKey ?? ""}
                  onChange={(e) => updateConfig({ falApiKey: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono"
                />
              </div>

              <div className="pt-4 border-t space-y-2">
                <h4 className="font-medium text-sm">导入/导出配置</h4>
                <div className="flex gap-2">
                  <button
                    onClick={exportToFile}
                    className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    导出配置
                  </button>
                  <button
                    onClick={importFromFile}
                    className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    导入配置
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (confirm("确定要重置所有配置吗？")) {
                      setConfig(resetConfig());
                      onConfigChange?.(resetConfig());
                    }
                  }}
                  className="w-full px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
                >
                  重置为默认
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
