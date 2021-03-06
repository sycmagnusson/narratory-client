import axios from "axios"
import dialogflow from "dialogflow"
import { struct } from "pb-util"
const fs = require("fs")
import * as nodePath from "path"

import { Intent } from "./index"
import { GoogleCredentials } from "./interfaces"
import { WebhookPayload, NarratoryResponse } from "./internalInterfaces"
import chalk from "chalk"

export const callApi = async (url: string, data: object): Promise<any> => {
  const repson = await axios({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify(data),
  })

  return await repson.data
}

export function isEmpty(obj: Object) {
  return Object.keys(obj).length === 0
}

export function getStartTurnIndex(index: string, maxIndex: number): number {
  if (
    !isNaN(index as any) &&
    parseInt(index) <= maxIndex &&
    parseInt(index) > 1
  ) {
    return parseInt(index)
  } else {
    return undefined
  }
}

export function listDir(dir: string) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err) {
      console.error("Error occured while reading directory!", err)
    }
  }
}

export const parseDialogflowResponse = (
  results: any,
  oldContexts: any[],
  sessionId: string
) => {
  const messages = results.fulfillmentMessages[0].text.text

  let webhookPayload: WebhookPayload

  try {
    webhookPayload = (struct.decode(
      results.webhookPayload
    ) as unknown) as WebhookPayload
  } catch (err) {
    webhookPayload = {
      endOfConversation: false,
      narratoryIntentName: "Unknown",
      classificationConfidence: 0,
    }
  }

  return {
    messages: messages.map((message) => {
      return {
        text: message,
        richContent: false,
        fromUser: false,
      }
    }),
    contexts:
      results.intent &&
      results.intent.isFallback &&
      results.intent.displayName == "Default Fallback Intent"
        ? oldContexts
        : results.outputContexts, // If we get a fallback, we want to keep contexts from before
    sessionId,
    responseTimeWebhook: (struct.decode(results.diagnosticInfo) as any)
      .webhook_latency_ms,
    ...webhookPayload,
  }
}

let sessionClient

export const getSessionClient = (googleCredentials: GoogleCredentials) => {
  if (!sessionClient) {
    sessionClient = new dialogflow.SessionsClient({
      credentials: googleCredentials,
    })
  }
  return sessionClient
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function getVariableName<TResult>(name: () => TResult) {
  var m = new RegExp("return (.*);").exec(name + "")
  if (m == null)
    throw new Error(
      "The function does not contain a statement matching 'return variableName;'"
    )
  return m[1]
}

const getIntentNames = (_exports: any) => {
  const intentNames: Array<any> = []
  if (typeof _exports === "object") {
    // Should always be true
    Object.keys(_exports).forEach((key) => {
      // Loop over all exported variables
      const exportedVariable = _exports[key]
      if (
        typeof exportedVariable == "object" &&
        "examples" in exportedVariable
      ) {
        // Identify intents
        intentNames.push([key, exportedVariable])
      }
    })
  }
  return intentNames
}

export const getNamedIntentsFromFolder = (
  path: string,
  intentNames?: { [key: string]: Intent }
) => {
  if (!intentNames) {
    intentNames = {}
  }
  const files = listDir(path)
  for (const file of files) {
    const fileName = file.name
    if (file.isFile()) {
      if (fileName.includes(".ts")) {
        try {
          const jsPath =
            "out/src/" + path.slice(4) + "/" + fileName.replace(".ts", ".js")
          const filePath = `${process.cwd()}/${jsPath}`

          let _exports = require(nodePath.normalize(filePath))
          getIntentNames(_exports).forEach((intentArr) => {
            intentNames[intentArr[0]] = intentArr[1]
          })
        } catch (err) {
          console.log(`Skipped file ${fileName} due to error. Error: ${err}`)
        }
      }
    } else {
      getNamedIntentsFromFolder(`${path}/${fileName}`, intentNames)
    }
  }
  return intentNames
}

export const printJson = (
  fileName: string,
  data: any,
  directory: string = "logs"
) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory)
  }
  fs.writeFileSync(
    process.cwd() + (directory ? `/${directory}/` : "/") + fileName,
    JSON.stringify(data, null, 2)
  )
}

export const printDebugMessage = (response: NarratoryResponse) => {
  console.log(
    chalk.yellow(
      `Debug - Intent: ${response.narratoryIntentName} [Conf: ${
        response.classificationConfidence
      }], Response time: ${response.responseTimeTotal}ms [DF: ${
        response.responseTimeTotal - response.responseTimeWebhook
      }ms, N: ${response.responseTimeWebhook}ms]`
    )
  )
}
