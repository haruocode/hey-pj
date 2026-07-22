import { useRoute } from './router';
import { ProjectList } from '../features/projects/ProjectList';
import { ProjectWorkspace } from './ProjectWorkspace';

export function App() {
  const [route, navigate] = useRoute();

  if (route.name === 'list') {
    return <ProjectList navigate={navigate} />;
  }
  return <ProjectWorkspace projectId={route.projectId} tab={route.tab} navigate={navigate} />;
}
