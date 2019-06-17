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
  return (tree: Tree) => {
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

    return mergeWith(sourceParametrizedTemplates);
  };
}

function updateProjectConfiguration(options: Schema): Rule {
  return async (tree: Tree) => {
    const workspace = await getWorkspace(tree);
    const project = workspace.projects.get(options.project);
    if (!project) {
      throw new SchematicsException(`Invalid project name (${options.project}).`);
    }

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

function addPackageDependency(_options: Schema): Rule {
  return (tree: Tree) => {
    const heroLoaderDependency = {
      type: NodeDependencyType.Dev,
      name: '@herodevs/hero-loader',
      version: '2.0.1'
    };

    addPackageJsonDependency(tree, heroLoaderDependency);

    return tree;
  };
}

function addStaticImport(options: Schema): Rule {
  return (tree: Tree) => {
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
  return (tree: Tree) => {
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

    const lazyLoadedModulePath = getProxyModulePath(options, tree);
    const newContent = `\n<hero-loader moduleName="${lazyLoadedModulePath}"></hero-loader>`;

    tree.overwrite(entryComponentPath, `${entryComponentContent.toString()}${newContent}`);

    return tree;
  };
}
