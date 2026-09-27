import {buildSite} from './localize.mjs';
const result=await buildSite();
console.log('Built Japanese and English pages and content-hashed app bundles into '+result.out+'.');
