/**
 * tsdown 双端构建配置：
 * - node 半端（lib/index.js）：注册工具 / 技能 / 设置命名空间，供 DSH 主机加载；
 * - 浏览器半端（lib/client.js）：侧边栏组件 / 设置卡片 / 对话内卡片，供 DSH Web UI 加载。
 * 打包策略与官方参考插件 dsh-visualize 一致：schemastery 与 cordis 保持外部依赖
 * （Loader 必须使用自己的实例校验 Config schema）；客户端侧 React / cordis /
 * slots / runtime 来自 DSH Web 壳层的共享模块表，其余代码全部内联。
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-qweather'

/** DSH Web 壳层共享模块表内的平台模块。 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** 浏览器半端的外部依赖（从壳层模块表解析）。 */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      // schemastery 保持外部依赖：Loader 用它校验插件 Config，必须是同一个实例；
      // cordis 仅作类型使用。
      neverBundle: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'],
    },
  },
  {
    // 浏览器半端：lib/client.js，由 harness 以 /plugins/<id>/client.js 提供服务。
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    deps: { neverBundle: [...CLIENT_EXTERNALS] },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
