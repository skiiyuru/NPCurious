/**
 * Static STRIPS domain for grid navigation. Only spatial sub-problem modeled in PDDL;
 * pickup/putdown stay in the BDI plan library.
 */

/** @type {string} */
export const NAV_DOMAIN = `(define (domain deliveroo-grid)
  (:requirements :strips :typing)
  (:types cell direction)
  (:predicates
    (at ?c - cell)
    (move-dir ?from - cell ?to - cell ?d - direction))
  (:action move
    :parameters (?from - cell ?to - cell ?d - direction)
    :precondition (and (at ?from) (move-dir ?from ?to ?d))
    :effect (and (not (at ?from)) (at ?to))))`

/** Domain accessor, symmetric with buildProblem (domain is static). */
export function buildDomain() {
  return NAV_DOMAIN
}
