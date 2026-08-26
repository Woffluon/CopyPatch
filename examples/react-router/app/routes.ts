import { index, type RouteConfig } from '@react-router/dev/routes';
import { copyPatchRoutes } from './copypatch.routes';

export default [
  index('routes/home.tsx'),
  ...copyPatchRoutes,
] satisfies RouteConfig;
