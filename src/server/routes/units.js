// routes/units.js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 const express = require('express');
 const { authMiddleware } = require('./authenticator');
 const { log } = require('../log');
 const { getConnection } = require('../db');
 const Unit = require('../models/Unit');
 const { removeAdditionalConversionsAndUnits } = require('../services/graph/handleSuffixUnits');
 const validate = require('jsonschema').validate;
 const { success, failure } = require('./response');
 
 const router = express.Router();
 
 /**
  * GET /units
  * Retrieve a list of all measurement units.
  * - Enforces that the caller has the 'manage units' permission.
  * - Returns an array of unit objects (id, identifier, display settings, etc.).
  */
 router.get(
   '/',
   authMiddleware('manage units'),
   async (req, res) => {
	 const conn = getConnection();
	 try {
	   const rows = await Unit.getAll(conn);
	   res.json(rows.map(item => ({
		 id: item.id,
		 name: item.name,
		 identifier: item.identifier,
		 unitRepresent: item.unitRepresent,
		 secInRate: item.secInRate,
		 typeOfUnit: item.typeOfUnit,
		 suffix: item.suffix,
		 displayable: item.displayable,
		 preferredDisplay: item.preferredDisplay,
		 note: item.note
	   })));
	 } catch (err) {
	   log.error(`Error fetching units: ${err}`, err);
	   res.sendStatus(500);
	 }
   }
 );
 
 /**
  * POST /units/edit
  * Update an existing unit’s properties.
  * - Validates the request body against the unit schema.
  * - If the suffix changes, removes any dependent conversions/units.
  * - Requires 'manage units' permission.
  */
 router.post(
   '/edit',
   authMiddleware('manage units'),
   async (req, res) => {
	 const unitSchema = { /* ... your schema ... */ };
	 const result = validate(req.body, unitSchema);
	 if (!result.valid) {
	   log.warn(`Invalid unit edit payload: ${result.errors}`);
	   return failure(res, 400, `Validation errors: ${result.errors}`);
	 }
 
	 const conn = getConnection();
	 try {
	   const unit = await Unit.getById(req.body.id, conn);
	   if (unit.suffix !== req.body.suffix) {
		 // Remove old conversions if suffix has changed
		 await removeAdditionalConversionsAndUnits(unit, conn);
	   }
	   Object.assign(unit, req.body);
	   await unit.update(conn);
	   success(res, 'Unit updated successfully');
	 } catch (err) {
	   log.error(`Failed to update unit: ${err}`, err);
	   failure(res, 500, 'Unable to update unit');
	 }
   }
 );
 
 /**
  * POST /units/addUnit
  * Create a brand-new measurement unit.
  * - Validates request against the unit schema.
  * - Inserts within a transaction for atomicity.
  * - Requires 'manage units' permission.
  */
 router.post(
   '/addUnit',
   authMiddleware('manage units'),
   async (req, res) => {
	 const unitSchema = { /* ... your schema ... */ };
	 const result = validate(req.body, unitSchema);
	 if (!result.valid) {
	   log.error(`Invalid unit creation payload: ${result.errors}`);
	   return failure(res, 400, `Validation errors: ${result.errors}`);
	 }
 
	 const conn = getConnection();
	 try {
	   await conn.tx(async t => {
		 const newUnit = new Unit(
		   undefined,
		   req.body.name,
		   req.body.identifier,
		   req.body.unitRepresent,
		   req.body.secInRate,
		   req.body.typeOfUnit,
		   req.body.suffix,
		   req.body.displayable,
		   req.body.preferredDisplay,
		   req.body.note
		 );
		 await newUnit.insert(t);
	   });
	   success(res, 'Unit created successfully');
	 } catch (err) {
	   log.error(`Error inserting new unit: ${err}`, err);
	   failure(res, 500, 'Unable to create unit');
	 }
   }
 );
 
 /**
  * POST /units/delete
  * Delete a unit by its ID.
  * - Validates that an integer `id` was provided.
  * - Relies on the database to error if the unit doesn’t exist.
  * - Requires 'manage units' permission.
  */
 router.post(
   '/delete',
   authMiddleware('manage units'),
   async (req, res) => {
	 const paramsSchema = {
	   type: 'object',
	   required: ['id'],
	   properties: { id: { type: 'integer' } }
	 };
	 const result = validate(req.body, paramsSchema);
	 if (!result.valid) {
	   log.warn(`Invalid delete-unit payload: ${result.errors}`);
	   return failure(res, 400, `Validation errors: ${result.errors}`);
	 }
 
	 const conn = getConnection();
	 try {
	   await Unit.delete(req.body.id, conn);
	   success(res, 'Unit deleted successfully');
	 } catch (err) {
	   log.error(`Error deleting unit: ${err}`, err);
	   failure(res, 500, 'Unable to delete unit');
	 }
   }
 );
 
 module.exports = router;
 