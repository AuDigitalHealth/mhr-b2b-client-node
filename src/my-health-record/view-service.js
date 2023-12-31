/*
 * Copyright 2021 The Australian Digital Health Agency
 *
 * Licensed under the Australian Digital Health Agency Open Source (Apache) License; you may not use this
 * file except in compliance with the License. A copy of the License is in the
 * 'license.txt' file, which should be provided with this work.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

const 	{signRequest, executeRequest, buildUnsignedB2BRequest, buildHeader} = require('./soap');
const	libxmljs 				= require("libxmljs");
let		xop 					= require('./mime-multipart').xop;
const 	async = require('async');
const 	namespaces = require('./namespaces');
const	moment = require('moment');


let stripPrefix = require("xml2js").processors.stripPrefix;
let xml2js = require('xml2js');

var parser = new xml2js.Parser({explicitArray: false, async: true, ignoreAttrs: true,tagNameProcessors: [stripPrefix]});
let		processMimeMultipart	= require('./mime-multipart').getAttachment;

let correctNameTypeDT = (name) => {
	let correctedName = {
		familyName: name.familyName
	}
	if (name.nameTitle){
		correctedName.nameTitle = Array.isArray(name.nameTitle) ? name.nameTitle : [name.nameTitle]
	}


	if (name.givenName){
		correctedName.givenName = Array.isArray(name.givenName) ? name.givenName : [name.givenName]
	}

	if (name.nameSuffix){
		correctedName.nameSuffix = Array.isArray(name.nameSuffix) ? name.nameSuffix : [name.nameSuffix]
	}

	if (name.usage){
		correctedName.usage = name.usage
	}
	return correctedName;

}


let toArray = (value) => {
	return Array.isArray(value) ? value : [value];
}


let getView = ({product, user, organisation}, patient, viewOptions) => {
	let uri, dataType, viewVersion, type;
	let viewParametersXml = "";
	if (viewOptions.view === "hro"){

		throw Error("HRO not yet supported by library");
		uri = "HealthRecordOverview/1.0";
		viewVersion = viewOptions.version ? viewOptions.version : "1.1";
		if (viewVersion != 1.1){
			throw Error("Only version 1.1 of the HRO is supported");
		}


		dataType = "healthRecordOverView";
		type = "xml";
		if (!viewOptions.parameters){
			viewParametersXml = `<q1:clinicalSynopsisLength>${viewOptions.parameters.clinicalSynopsisLength}</q1:clinicalSynopsisLength>`;
		}else{
			viewParametersXml = `<q1:clinicalSynopsisLength>0</q1:clinicalSynopsisLength>`;
		}
	}else if (viewOptions.view === "medicare"){
		uri = "MedicareOverview/1.0";
		viewVersion = viewOptions.version ? viewOptions.version : "1.1";
		dataType = "medicareOverview";
		viewParametersXml = `<q1:fromDate>2013-02-04</q1:fromDate>
		<q1:toDate>2018-11-06</q1:toDate>`;
		type = "cda";

	
	}else if (viewOptions.view === "pdv"){
		uri = "PrescriptionAndDispenseView/1.0";
		viewVersion = viewOptions.version ? viewOptions.version : "1.0";
		dataType = "prescriptionAndDispenseView";
		type = "cda";
		viewParametersXml = `<q1:fromDate>2013-02-04</q1:fromDate>
		<q1:toDate>2018-11-06</q1:toDate>`;
	}else if (viewOptions.view === "pathology"){
		uri = "PathologyReportView/1.0";
		viewVersion = viewOptions.version ? viewOptions.version : "1.0";
		dataType = "pathologyReportView";
		type = "xml";
		viewParametersXml = `				<q1:fromDate>2018-04-03</q1:fromDate>
		<q1:toDate>2018-04-03</q1:toDate>`;

	}else if (viewOptions.view === "diagnosticImaging"){
		uri = "DiagnosticImagingReportView/1.0";
		viewVersion = viewOptions.version ? viewOptions.version : "1.0";
		dataType = "diagnosticImagingReportView";
		type = "xml";

		viewParametersXml = `				<q1:fromDate>2013-02-04</q1:fromDate>
		<q1:toDate>2018-11-06</q1:toDate>`;
	}



	return new Promise((resolve, reject) => {
	//handle indivual details and audit view in seperate functions.
	try {
		executeRequest(organisation, "getView", 
		signRequest(
			buildUnsignedB2BRequest(
				buildHeader(product, user, organisation, patient, "http://ns.electronichealth.net.au/pcehr/svc/GetView/1.0/GetViewPortType/getViewRequest"),
				`
				<getView xmlns="http://ns.electronichealth.net.au/pcehr/xsd/interfaces/GetView/1.0">
					<view xmlns:q1="http://ns.electronichealth.net.au/pcehr/xsd/interfaces/${uri}" xsi:type="q1:${dataType}">
						<q1:versionNumber>${viewVersion}</q1:versionNumber>
						${viewParametersXml}
						</view>
				</getView>
				`
			),
			organisation
		),
		(error, response, body) => {
			if (error){
				reject(error);
			}else{
				if (type === "cda"){
					resolve({ documentType: "view", viewType: viewOptions.view, viewVersion: viewVersion, attachmentFormat: "cdaPackage", ...processMimeMultipart(response, body)});
				}else if(type === "xml") {
				
					if (viewOptions.view === "pathology"){
						let pathologyResponse = libxmljs.parseXml(xop(response, body));
						let individualProfile = {
							ihiNumber: 			pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/commonCoreElements:ihiNumber", namespaces).text(),
							individual: {
								name: {
									familyName: pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/pathView:individual/commonCoreElements:name/commonCoreElements:familyName", 	namespaces).text(),
									givenName:	pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/pathView:individual/commonCoreElements:name/commonCoreElements:givenName", 		namespaces).text(),
									usage:		pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/pathView:individual/commonCoreElements:name/commonCoreElements:usage", 		namespaces).text(),
								},
								sex: 			pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/pathView:individual/commonCoreElements:sex", 								namespaces).text(),
								dateOfBirth: 	pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:individualProfile/pathView:individual/commonCoreElements:dateOfBirth", 								namespaces).text()
							}
						}
						let viewMetadata = {
							informationAvailable: pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse/pathView:viewMetadata/pathView:informationAvailable", namespaces).text().toLowerCase() === "true",
							individualProfile
						}


						if (viewMetadata.informationAvailable){
							let pathologyReports = pathologyResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/pathView:pathologyReportViewResponse", namespaces)
								.childNodes()
								.filter(node => node.name() === "pathologyReport")
								.map(node => node.toString());

							async.map(pathologyReports, function(pathologyReport, callback){
								parser.parseString(pathologyReport, function(err, result) {
									if (err){
										callback(err)
									}else{
										//Adjusting  the cardinality. To keep a consistent javascript object response.
										result.pathologyReport = Array.isArray(result.pathologyReport) ? result.pathologyReport : [result.pathologyReport]
										result.pathologyReport = result.pathologyReport.map(pathologyReport => {
											if (!Array.isArray(pathologyReport.pathologyTestResult)){
												pathologyReport.pathologyTestResult = [pathologyReport.pathologyTestResult];
											}
											
											pathologyReport.reportInformation.cdaEffectiveTime = pathologyReport.reportInformation.CDAeffectiveTime; 
											delete pathologyReport.reportInformation.CDAeffectiveTime;

											pathologyReport.documentMetadata = {
												"creationTime":			pathologyReport.reportInformation.cdaEffectiveTime,
												"serviceStartTime": 	pathologyReport.pathologyTestResult.map(testResult => testResult.specimenCollectionDate).reduce((accumulator, currentValue) => moment(accumulator).isBefore(moment(currentValue)) ? accumulator : currentValue),
												"serviceStopTime":		pathologyReport.pathologyTestResult.map(testResult => testResult.specimenCollectionDate).reduce((accumulator, currentValue) => moment(accumulator).isAfter(moment(currentValue)) ? accumulator : currentValue),
												"repositoryUniqueId":	pathologyReport.reportInformation.documentLink.substring(6, pathologyReport.reportInformation.documentLink.indexOf("/")),
												"authorInstitution": {
													"hl7": `${pathologyReport.clinicalDocumentAuthor.healthcareProviderOrganisationName}^^^^^^^^^1.2.36.1.2001.1003.0.${pathologyReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier}`,
													"organizationName": pathologyReport.clinicalDocumentAuthor.healthcareProviderOrganisationName,
													"organizationIdentifier": "1.2.36.1.2001.1003.0."+pathologyReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier
												  },
												  "authorPerson": {
													"hl7": 					`^${pathologyReport.clinicalDocumentAuthor.healthcareProviderName.familyName}^${pathologyReport.clinicalDocumentAuthor.healthcareProviderName.givenName ? pathologyReport.clinicalDocumentAuthor.healthcareProviderName.givenName : ""}^^^${pathologyReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle ? pathologyReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle : ""}^^^${pathologyReport.clinicalDocumentAuthor.healthcareProviderIdentifier ? "&"+pathologyReport.clinicalDocumentAuthor.healthcareProviderIdentifier+"&ISO" : ""}`,
													"familyName":			pathologyReport.clinicalDocumentAuthor.healthcareProviderName.familyName,
													"firstGivenName":		pathologyReport.clinicalDocumentAuthor.healthcareProviderName.givenName,
													"prefix":				pathologyReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle,
													"assigningAuthority":	"&1.2.36.1.2001.1003.0."+pathologyReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier+"&ISO"
												  },
												  "authorSpecialty": pathologyReport.clinicalDocumentAuthor.healthcareProviderRole,
												  "class": {
													"codingScheme": "NCTIS Data Components",
													"code": "Pathology Report"
												  },
												  "patientId": `${individualProfile.ihiNumber}^^^&1.2.36.1.2001.1003.0&ISO`,
												  "documentId": pathologyReport.reportInformation.documentId
											};

											if (!pathologyReport.documentMetadata.authorPerson.firstGivenName){
												delete pathologyReport.documentMetadata.authorPerson.firstGivenName
											}
											if (!pathologyReport.documentMetadata.authorPerson.prefix){
												delete pathologyReport.documentMetadata.authorPerson.prefix
											}
											return pathologyReport;
										});
										callback(null, result);
									}
								});
							}, function(err, pathologyReports) {
								if (err){
									reject();
								}else{
									resolve({
										viewMetadata,
										pathologyReports,
									});
								}
							});
						}else{
							resolve({
								viewMetadata,
								pathologyReports: []
							});
						}
					}else if (viewOptions.view === "diagnosticImaging"){
						let diagnosticImagingResponse = libxmljs.parseXml(xop(response, body));

						let individualProfile = {
							ihiNumber: 			diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/commonCoreElements:ihiNumber", namespaces).text(),
							individual: {
								name: {
									familyName: diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/diView:individual/commonCoreElements:name/commonCoreElements:familyName", 	namespaces).text(),
									givenName:	diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/diView:individual/commonCoreElements:name/commonCoreElements:givenName", 		namespaces).text(),
									usage:		diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/diView:individual/commonCoreElements:name/commonCoreElements:usage", 		namespaces).text(),
								},
								sex: 			diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/diView:individual/commonCoreElements:sex", 								namespaces).text(),
								dateOfBirth: 	diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:individualProfile/diView:individual/commonCoreElements:dateOfBirth", 								namespaces).text()
							}
						}
						let viewMetadata = {
							informationAvailable: diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse/diView:viewMetadata/diView:informationAvailable", namespaces).text().toLowerCase() === "true",
							individualProfile
						}

						if (viewMetadata.informationAvailable){
							let diagnosticImagingReports = diagnosticImagingResponse.get("//soap:Envelope/soap:Body/getView:getViewResponse/getView:view/getView:data/diView:diagnosticImagingReportViewResponse", namespaces)
								.childNodes()
								.filter(node => node.name() === "diagnosticImagingReport")
								.map(node => node.toString());
								async.map(diagnosticImagingReports, function(diagnosticImagingReport, callback){
									parser.parseString(diagnosticImagingReport, function(err, result) {
										if (err){
											callback(err)
										}else{

											//Adjusting  the cardinality. To keep a consistent javascript object response.
											if (!Array.isArray(result.diagnosticImagingReport)){
												result.diagnosticImagingReport = [result.diagnosticImagingReport];
											}
											result.diagnosticImagingReport = result.diagnosticImagingReport.map(diagnosticImagingReport => {
	
												if (!Array.isArray(diagnosticImagingReport.imagingExaminationResult)){
													diagnosticImagingReport.imagingExaminationResult = [diagnosticImagingReport.imagingExaminationResult];
												}

												diagnosticImagingReport.imagingExaminationResult.map(imagingExaminationResult => {
													if (imagingExaminationResult.anatomicalSiteDetails  && (!Array.isArray(imagingExaminationResult.anatomicalSiteDetails))){
														imagingExaminationResult.anatomicalSiteDetails = [imagingExaminationResult.anatomicalSiteDetails];
													}

													if (imagingExaminationResult.anatomicalLocation && (!Array.isArray(imagingExaminationResult.anatomicalLocation))){
														imagingExaminationResult.anatomicalLocation = [imagingExaminationResult.anatomicalLocation];
													}
													return imagingExaminationResult;
												});
												
												diagnosticImagingReport.reportInformation.cdaEffectiveTime = diagnosticImagingReport.reportInformation.CDAeffectiveTime; 
												
											diagnosticImagingReport.documentMetadata = {
												"creationTime":			diagnosticImagingReport.reportInformation.cdaEffectiveTime,
												"serviceStartTime": 	diagnosticImagingReport.imagingExaminationResult.map(testResult => testResult.imagingServiceDateTime).reduce((accumulator, currentValue) => moment(accumulator).isBefore(moment(currentValue)) ? accumulator : currentValue),
												"serviceStopTime":		diagnosticImagingReport.imagingExaminationResult.map(testResult => testResult.imagingServiceDateTime).reduce((accumulator, currentValue) => moment(accumulator).isAfter(moment(currentValue)) ? accumulator : currentValue),
												"repositoryUniqueId":	diagnosticImagingReport.reportInformation.documentLink.substring(6, diagnosticImagingReport.reportInformation.documentLink.indexOf("/")),
												"authorInstitution": {
												"hl7": `${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderOrganisationName}^^^^^^^^^1.2.36.1.2001.1003.0.${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier}`,
												"organizationName": diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderOrganisationName,
													"organizationIdentifier": "1.2.36.1.2001.1003.0."+diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier
												  },
												  "authorPerson": {
													"hl7": 					`^${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.familyName}^${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.givenName ? diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.givenName : ""}^^^${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle ? diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle : ""}^^^${diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderIdentifier ? "&"+diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderIdentifier+"&ISO" : ""}`,
													"familyName":			diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.familyName,
													"firstGivenName":		diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.givenName,
													"prefix":				diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderName.nameTitle,
													"assigningAuthority":	"&1.2.36.1.2001.1003.0."+diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderOrganisationIdentifier+"&ISO"
												  },
												  "authorSpecialty": diagnosticImagingReport.clinicalDocumentAuthor.healthcareProviderRole,
												  "class": {
													"codingScheme": "NCTIS Data Components",
													"code": "Diagnostic Imaging Report"
												  },
												  "patientId": `${individualProfile.ihiNumber}^^^&1.2.36.1.2001.1003.0&ISO`,
												  "documentId": diagnosticImagingReport.reportInformation.documentId
											};

											//remove elements that are optional in the schema
											if (!diagnosticImagingReport.documentMetadata.authorPerson.firstGivenName){
												delete diagnosticImagingReport.documentMetadata.authorPerson.firstGivenName
											}
											if (!diagnosticImagingReport.documentMetadata.authorPerson.prefix){
												delete diagnosticImagingReport.documentMetadata.authorPerson.prefix
											}


												return diagnosticImagingReport;

											});


											callback(null, result);
										}
									});
								}, function(err, diagnosticImagingReports) {
									if (err){
										reject();
									}else{
										resolve({
											viewMetadata,
											diagnosticImagingReports,
										});
									}
								});
						}

					}




				}

			}
		}, {encoding: null}
	)
	}catch (exception){

	}
});
};


module.exports = {
	getView
};