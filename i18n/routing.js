/**
 * next-intl 路由配置
 * 提供自动处理语言前缀的导航组件
 * 
 * @see https://next-intl-docs.vercel.app/docs/routing/navigation
 */

import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from './config';

// 定义路由配置
export const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix: 'always', // 与 middleware 保持一致
});

// 导出自动处理语言前缀的导航组件
export const {
    Link,           // 自动添加语言前缀的 Link 组件
    redirect,       // 自动添加语言前缀的 redirect
    usePathname,    // 返回不包含语言前缀的路径
    useRouter,      // 自动处理语言前缀的 router
    getPathname,    // 服务端获取路径
} = createNavigation(routing);
