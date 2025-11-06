import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';

interface ProjectFilterProps {
  selectedProjectIds: string[];
  onProjectsChange: (projectIds: string[]) => void;
}

export function ProjectFilter({ selectedProjectIds, onProjectsChange }: ProjectFilterProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const allProjects = await projectsApi.getAll();
        setProjects(allProjects);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleToggleProject = (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      onProjectsChange(selectedProjectIds.filter((id) => id !== projectId));
    } else {
      onProjectsChange([...selectedProjectIds, projectId]);
    }
  };

  const handleClearAll = () => {
    onProjectsChange([]);
  };

  const selectedProjects = projects.filter((project) => selectedProjectIds.includes(project.id));

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Filter by project
            </span>
            {selectedProjectIds.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 rounded-sm px-1 font-normal"
              >
                {selectedProjectIds.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel>Filter by project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No projects available
            </div>
          ) : (
            projects.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={selectedProjectIds.includes(project.id)}
                onCheckedChange={() => handleToggleProject(project.id)}
              >
                {project.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
          {selectedProjectIds.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm font-normal"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Display selected projects as removable badges */}
      {selectedProjects.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedProjects.map((project) => (
            <Badge
              key={project.id}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => handleToggleProject(project.id)}
            >
              {project.name}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
