import { strings } from '@angular-devkit/core';
import {
  apply,
  chain,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  SchematicsException,
  template,
  Tree,
  url
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { addImportToModule } from '@schematics/angular/utility/ast-utils';
import {
  addPackageJsonDependency,
  NodeDependencyType
} from '@schematics/angular/utility/dependencies';
import { findModuleFromOptions } from '@schematics/angular/utility/find-module';
import { targetBuildNotFoundError } from '@schematics/angular/utility/project-targets';
import { getWorkspace, updateWorkspace } from '@schematics/angular/utility/workspace';
import { any, identity, includes, map, pathOr, pipe } from 'ramda';
import { Schema } from './models';
import {
  doChanges,
  getLazyModuleName,
  getModulePath,
  getProxyModulePath,
  getSourceFile
} from './utils';

export function lazyLoadingProxy(options: Schema): Rule {
  return async (_tree: Tree, _context: SchematicContext) => {
    // Good practice to use Rule chaining
    return chain([
      createProxyModule(options),
      updateProjectConfiguration(options),
      addPackageDependency(options),
      addStaticImport(options),
      addTemplateLoader(options)
    ]);
  };
}

function createProxyModule(options: Schema): Rule {
  return (tree: Tree): Rule => {
    // Get all templates into a variable
    const sourceTemplates = url('./templates');
    // Parse the templates
    const sourceParametrizedTemplates = apply(sourceTemplates, [
      template({
        ...options,
        // String helper functions (dasherize, classify, etc.)
        ...strings,
        lazyModule: getLazyModuleName(options)
      }),
      move(getModulePath(options, tree))
    ]);

    // Return a Rule to merge with other Rules
    return mergeWith(sourceParametrizedTemplates);
  };
}

function updateProjectConfiguration(options: Schema): Rule {
  return async (tree: Tree): Promise<Rule> => {
    // Get workspace (angular.json) through utility functions
    const workspace = await getWorkspace(tree);
    const project = workspace.projects.get(options.project);
    if (!project) {
      throw new SchematicsException(`Invalid project name (${options.project}).`);
    }

    // Access inner keys
    const buildTarget = project.targets.get('build');
    if (!buildTarget) {
      throw targetBuildNotFoundError();
    }

    const lazyModuleName = getLazyModuleName(options);
    const entryExists = pipe(
      pathOr([], ['options', 'lazyModules']),
      map(includes(lazyModuleName)),
      any(identity)
    )(buildTarget);
    if (entryExists) {
      throw new SchematicsException('LazyModules entry seems to be present already.');
    }

    // Complete with our lazyModule
    buildTarget.options = {
      ...buildTarget.options,
      lazyModules: [
        ...pathOr<string[]>([], ['options', 'lazyModules'], buildTarget),
        getProxyModulePath(options, tree)
      ]
    };

    return updateWorkspace(workspace);
  };
}

function addPackageDependency(options: Schema): Rule {
  return (tree: Tree, context: SchematicContext): Tree => {
    // Create new dependency
    const heroLoaderDependency = {
      type: NodeDependencyType.Dev,
      name: '@herodevs/hero-loader',
      version: '2.0.1'
    };

    // Add it to package.json through utility functions
    addPackageJsonDependency(tree, heroLoaderDependency);

    if (!options.skipInstall) {
      context.addTask(new NodePackageInstallTask());
    }

    return tree;
  };
}

function addStaticImport(options: Schema): Rule {
  return (tree: Tree): Tree => {
    // Find entry module path through utility functions
    const entryModulePath = findModuleFromOptions(tree, {
      name: options.entryModule,
      module: options.entryModule,
      path: `${getModulePath(options, tree)}`,
      skipImport: options.skipImport
    });
    if (!entryModulePath) {
      return tree;
    }

    const entryModuleSource = getSourceFile(tree, entryModulePath);
    if (!entryModuleSource) {
      throw new SchematicsException(`Could not find entry module ${options.entryModule}.`);
    }

    // Insert import changes
    doChanges(
      tree,
      addImportToModule(
        entryModuleSource as any,
        entryModulePath,
        'HeroLoaderModule',
        '@herodevs/hero-loader'
      ),
      entryModulePath
    );

    return tree;
  };
}

function addTemplateLoader(options: Schema): Rule {
  return (tree: Tree): Tree => {
    // Find entry component path through utility functions
    const entryComponentPath = findModuleFromOptions(tree, {
      name: options.entryModule,
      path: getModulePath(options, tree),
      moduleExt: '.html',
      skipImport: options.skipImport
    });
    if (!entryComponentPath) {
      return tree;
    }

    const entryComponentContent = tree.read(entryComponentPath);
    if (!entryComponentContent) {
      throw new SchematicsException(`Could not find entry component ${options.entryModule}.`);
    }

    // Add HTML entry through tree overwrite
    const lazyLoadedModulePath = getProxyModulePath(options, tree);
    const newContent = `\n<hero-loader moduleName="${lazyLoadedModulePath}"></hero-loader>`;
    tree.overwrite(entryComponentPath, `${entryComponentContent.toString()}${newContent}`);

    return tree;
  };
}
