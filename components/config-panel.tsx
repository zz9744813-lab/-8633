"use client";

import { useState, useEffect } from "react";
import { Settings, X, Key, Database, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "api" | "world" | "agents";

export function ConfigPanel({ isOpen, onClose }: ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("api");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4");
  const [population, setPopulation] = useState(12);
  const [eraPack, setEraPack] = useState("18th_england");
  const [isCreating, setIsCreating] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("pixel_town_api_key");
    const savedModel = localStorage.getItem("pixel_town_model");
    if (savedKey) setApiKey(savedKey);
    if (savedModel) setModel(savedModel);
  }, []);

  // Save to localStorage
  const saveApiConfig = () => {
    localStorage.setItem("pixel_town_api_key", apiKey);
    localStorage.setItem("pixel_town_model", model);
    alert("配置已保存到浏览器本地存储");
  };

  // Create world handler
  const handleCreateWorld = async () => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "新世界",
          eraPack,
          population,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("World created:", data);
        alert(`世界创建成功！已生成 ${population} 个居民`);
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

  const tabs = [
    { id: "api" as Tab, label: "API 设置", icon: Key },
    { id: "world" as Tab, label: "世界设置", icon: Database },
    { id: "agents" as Tab, label: "居民管理", icon: Users },
  ];

  const models = [
    { value: "claude-sonnet-4", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4", label: "Claude Haiku 4 (便宜)" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (便宜)" },
    { value: "ollama-llama3.1", label: "Ollama (本地)" },
  ];

  const eraPacks = [
    { value: "18th_england", label: "18世纪末英国乡村" },
    { value: "song_dynasty", label: "北宋汴梁市井" },
    { value: "1950s_usa", label: "1950年代美国小镇" },
    { value: "mars_2080", label: "2080火星殖民地" },
    { value: "edo_japan", label: "江户时代日本宿场町" },
  ];

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
          "fixed top-0 right-0 h-full w-96 bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 ease-in-out",
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
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors flex-1",
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

              <div>
                <label className="block text-sm font-medium mb-2">
                  LLM 提供商
                </label>
                <select className="w-full px-3 py-2 rounded-md border border-input bg-background">
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama (本地)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  默认模型
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  {models.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={saveApiConfig}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
              >
                保存 API 配置
              </button>
            </div>
          )}

          {activeTab === "world" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  时代包
                </label>
                <select
                  value={eraPack}
                  onChange={(e) => setEraPack(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  {eraPacks.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  初始人口: {population}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={population}
                  onChange={(e) => setPopulation(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  随机种子
                </label>
                <input
                  type="text"
                  placeholder="留空则随机"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
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

              <div className="p-3 bg-muted rounded-md">
                <h4 className="font-medium text-sm mb-2">当前时代: 18世纪末英国乡村</h4>
                <p className="text-xs text-muted-foreground">
                  没有电、没有蒸汽机。阶级森严：地主、自耕农、佃农、雇工。
                  教会主导道德观，识字率约50%。
                </p>
              </div>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <h4 className="font-medium text-sm mb-1">当前居民: 3/12</h4>
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
        </div>
      </div>
    </>
  );
}
