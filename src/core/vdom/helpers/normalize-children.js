/* @flow */

import VNode, { createTextVNode } from 'core/vdom/vnode'
import { isFalse, isTrue, isDef, isUndef, isPrimitive } from 'shared/util'

// The template compiler attempts to minimize the need for normalization by
// statically analyzing the template at compile time.
//
// For plain HTML markup, normalization can be completely skipped because the
// generated render function is guaranteed to return Array<VNode>. There are
// two cases where extra normalization is needed:

// 1. When the children contains components - because a functional component
// may return an Array instead of a single root. In this case, just a simple
// normalization is needed - if any child is an Array, we flatten the whole
// thing with Array.prototype.concat. It is guaranteed to be only 1-level deep
// because functional components already normalize their own children.
// simpleNormalizeChildren 方法调用场景是 render 函数是编译生成的
export function simpleNormalizeChildren (children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      // 这里只做一层数组扁平化
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}

// 注意下，这里用 call 和 apply 输出的最终结果为：
// Array.prototype.concat.call([], [[1, 2], [3, 4]]) => [[1, 2], [3, 4]]
// Array.prototype.concat.apply([], [[1, 2], [3, 4]]) => [1, 2, 3, 4]

// 2. When the children contains constructs that always generated nested Arrays,
// e.g. <template>, <slot>, v-for, or when the children is provided by user
// with hand-written render functions / JSX. In such cases a full normalization
// is needed to cater to all possible types of children values.
// normalizeChildren 方法的调用场景有 2 种:
// (1) 一个场景是 render 函数是用户手写的，当 children 只有一个节点的时候，Vue.js 从接口层面允许用户把 children 写成基础类型用来创建单个简单的文本节点，
//     这种情况会调用 createTextVNode 创建一个文本节点的 VNode
// (2) 另一个场景是当编译 slot、v-for 的时候会产生嵌套数组的情况，会调用 normalizeArrayChildren 方法
export function normalizeChildren (children: any): ?Array<VNode> {
  return isPrimitive(children)
    ? [createTextVNode(children)]
    : Array.isArray(children)
      ? normalizeArrayChildren(children)
      : undefined
}

function isTextNode (node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}

// children 表示要规范的子节点，nestedIndex 表示嵌套的索引
// 在遍历的过程中，对于如下 3 种情况都做了类似处理，即如果存在两个连续的 text 节点，会把它们合并成一个 text 节点。
function normalizeArrayChildren (children: any, nestedIndex?: string): Array<VNode> {
  const res = []
  let i, c, lastIndex, last
  for (i = 0; i < children.length; i++) {
    c = children[i]
    if (isUndef(c) || typeof c === 'boolean') continue
    lastIndex = res.length - 1
    last = res[lastIndex]
    //  nested
    if (Array.isArray(c)) {
      // 1.c 如果是一个数组类型，则递归调用 normalizeArrayChildren
      if (c.length > 0) {
        c = normalizeArrayChildren(c, `${nestedIndex || ''}_${i}`)
        // merge adjacent text nodes
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text)
          c.shift()
        }
        res.push.apply(res, c)
      }
    } else if (isPrimitive(c)) {
      // 2.如果是基础类型，则通过 createTextVNode 方法转换成 VNode 类型
      if (isTextNode(last)) {
        // merge adjacent text nodes
        // this is necessary for SSR hydration because text nodes are
        // essentially merged when rendered to HTML strings
        res[lastIndex] = createTextVNode(last.text + c)
      } else if (c !== '') {
        // convert primitive to vnode
        res.push(createTextVNode(c))
      }
    } else {
      // 3.分支进入这里，说明 c 已经是一个 VNode 类型了
      if (isTextNode(c) && isTextNode(last)) {
        // merge adjacent text nodes
        res[lastIndex] = createTextVNode(last.text + c.text)
      } else {
        // default key for nested array children (likely generated by v-for)
        // 如果 children 是一个列表并且列表还存在嵌套的情况，则根据 nestedIndex 去更新它的 key
        if (isTrue(children._isVList) &&
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
          c.key = `__vlist${nestedIndex}_${i}__`
        }
        res.push(c)
      }
    }
  }
  return res
}
