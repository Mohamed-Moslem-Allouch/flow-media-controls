/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 * -------------------------------------------------------------
 * Runs in the webpage's main execution context ("world": "MAIN").
 */

(function () {
  'use strict';

  // Prevent multiple executions
  if (window.__vscPageBridgeLoaded) return;
  window.__vscPageBridgeLoaded = true;

  // Protect host applications (Instagram & Facebook React single-page apps)
  // against DOM reconciliation errors when external extension nodes are unmounted.
  // This prevents the critical bug where closing a post modal (/p/ or /reel/) fails
  // because React throws NotFoundError: Failed to execute 'removeChild' on 'Node'.
  try {
    const origRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      if (!child || child.parentNode !== this) {
        if (child && child.parentNode) {
          try {
            return child.parentNode.removeChild(child);
          } catch (e) {
            return child;
          }
        }
        return child;
      }
      return origRemoveChild.call(this, child);
    };

    const origInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (newNode, referenceNode) {
      if (referenceNode && referenceNode.parentNode !== this) {
        return this.appendChild(newNode);
      }
      return origInsertBefore.call(this, newNode, referenceNode);
    };
  } catch (e) {}
})();
