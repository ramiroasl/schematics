import { strings } from '@angular-devkit/core';
import { SchematicsException, Tree } from '@angular-devkit/schematics';
import { Change, InsertChange } from '@schematics/angular/utility/change';
import { getProject } from '@schematics/angular/utility/project';
import { last } from 'ramda';
import { createSourceFile, ScriptTarget, SourceFile } from 'typescript';
import { Schema } from '../models';

export const doChanges = (tree: Tree, changes: Change[], modulePath: string): void => {
  const recorder = tree.beginUpdate(modulePath);
  for (const change of changes) {
    if (change instanceof InsertChange) {
      recorder.insertLeft(change.pos, change.toAdd);
    }
  }

  tree.commitUpdate(recorder);
};

export const parseLazyModuleInput = (options: Schema): string[] => options.lazyModule.split('/');

export const getLazyModuleName = (options: Schema): string => last(parseLazyModuleInput(options));

export const getModulePath = (options: Schema, tree: Tree): string => {
  const project = getProject(tree, options.project);
  const projectRoot = project.sourceRoot ? project.sourceRoot : project.root;

  return `${projectRoot}${options.root}`;
};

export const getProxyModulePath = (options: Schema, tree: Tree): string => {
  const projectPath = getModulePath(options, tree);
  const lazyModule = getLazyModuleName(options);
  const dasherizedLazyModule = strings.dasherize(lazyModule);
  const classifiedLazyModule = strings.classify(lazyModule);

  return [
    projectPath,
    `+proxy-${dasherizedLazyModule}`,
    `proxy-${dasherizedLazyModule}.module.ts#Proxy${classifiedLazyModule}Module`
  ].join('/');
};

export const getSourceFile = (host: Tree, path: string): SourceFile => {
  const buffer = host.read(path);
  if (!buffer) {
    throw new SchematicsException(`Could not find ${path}.`);
  }
  const content = buffer.toString();
  const source = createSourceFile(path, content, ScriptTarget.Latest, true);

  return source;
};
