# Domain Glossary

## Project

A construction project delivered for a customer. The product interface calls a
project an “obra.”

## Customer

The person or organization purchasing work delivered through a project.

## Portal User

An authenticated person granted read access to one or more customer projects.
A portal user is not the customer record itself.

## Contractor

A third party hired to perform work for a project.

## Supplier

A vendor that provides materials. A supplier is distinct from a contractor.

## Contract

An agreement either to sell services to a customer or to hire a contractor. A
contract can be a base agreement or an addendum to a base agreement.

## Measurement

A record of billable progress against a customer-sale contract. The product
interface calls a measurement a “medição.”

## Material

A catalog item independent of how much stock exists at any location.

## Inventory Balance

The quantity of one material available at one inventory location.

## Equipment

A physical asset tracked by the business.

## Project Equipment

A planned equipment item within a project. It can later be linked to physical
equipment.

## Takeoff Desktop

RLP Takeoff, the desktop app (`apps/takeoff`) in which an estimator measures
drawings and prices the result as a budget sheet (“planilha orçamentária”).
Its projects are local `*.takeoff.json` files. Not the same as a purchasing
takeoff.

## Purchasing Takeoff

A list of materials and quantities for a project kept in the backend
(`takeoffs` / `takeoffItems`), whose lines purchasing links to catalog
materials and prices. The product interface calls it a “takeoff” under
Compras.

## Drawing

One PDF of a takeoff desktop project. The product interface calls it a
“planta.” Markings, locations and page scales belong to a drawing; items are
shared by the whole project.

## Marking

A count, run or area drawn on a drawing page for one item. The product
interface calls it a “marcação.” A marking is not a measurement (“medição”),
which is billable progress on a contract.

## Location

A named place (floor, apartment, room) drawn as one or more regions, possibly
on several drawings; markings inside a region are grouped under it in the
budget. The product interface calls it a “local” or “ambiente.”

## Kit

A preset that creates one linked marking per material from a single run or
click (a split's line set: copper, insulation and cable together).

## Item

A line of a takeoff desktop budget: a material or service with a unit, budget
group, material and labour unit prices and optional waste. Its quantity comes
from its markings.

## Duct Network

A budget item whose sheet metal, insulation, flanges, supports and labour are
computed from the rectangular duct runs drawn on it (NBR 16401). The product
interface calls it a “rede de dutos.”

## VRF System

A budget item for one VRF refrigerant system (condenser and evaporators),
priced from its refrigerant runs, with tube diameters sized by the brand's
tables. The product interface calls it a “sistema VRF.”

## BDI

The multiplier applied to a budget's grand total (“TOTAL GERAL”) to reach the
selling price; 1.42 means 42 % on top of cost.
