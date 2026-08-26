import { route } from '@react-router/dev/routes';

export const copyPatchRoutes = [
  route('/__copypatch/api/v2/*', './routes/copypatch-api.ts'),
];
