/** 処理時間測定開始 */
var start_time = new Date()

/** 設定値1: 一度のバッチ分析で検索する対象数（10以上200以下） */
var NUMBER_OF_ONCE_ANALYZING = 150
/** 設定値2: 一度のスクリプト実行で実行するバッチ分析の回数（1以上） */
var NUMBER_OF_EXECUTION = 2

//__________________________________________________________
// Google Apps Scriptの１回の実行時間は6分までです。
// 当プログラムは１回の実行の間に上記設定値1, 2に基づいたバッチ検索を複数回行い、
// 処理が終了した段階で1分後（※注1）にプログラムを再起動するようトリガーを発行します。
// 初期設定として、一回に200ドメインのバッチ分析を2回繰り返すようにしていますが、
// もし処理がうまく動かない場合や、タイムアウトが発生してしまう場合は、これら設定値を調整してください。
//
// 再実行分を含めたスクリプトの実行状態は、表示タブの【実行数】から確認できます。
// また、再実行のためのトリガーは編集タブの【現在のプロジェクトのトリガー】から確認できます。
//
// ※注1
// プログラムの再起動までの待ち時間にはブレが存在します。
// 特にスプレッドシートに紐づけられたこのスクリプトの正常性がGoogle側に評価されるまでの間は、この待ち時間が最長15分～20分までかかる場合も存在します。
// 何度か実行を繰り返していると、Google側にスクリプトの正常性が評価され、再実行待ち時間が安定するようになりますので、
// 再実行待ち時間が長い場合は、何度かスクリプトを実行し、Google側の評価を待ってください。
//__________________________________________________________

// 設定値のバリデーション
if (NUMBER_OF_ONCE_ANALYZING > 200) {
    NUMBER_OF_ONCE_ANALYZING = 200
} else if (NUMBER_OF_ONCE_ANALYZING < 10) {
    NUMBER_OF_ONCE_ANALYZING = 10
}
if (NUMBER_OF_EXECUTION < 1) {
    NUMBER_OF_EXECUTION = 1
}

/** ログイン後の通信用情報取得 */
function getAfterLoginOptions(spreadSheet) {
    Logger.log("getAfterLoginOptions")
    /* シート情報 */
    const idAndPassSheet = spreadSheet.getSheetByName("ID,PASS入力用"),
        email = idAndPassSheet.getRange(1, 2).getValue(),
        password = idAndPassSheet.getRange(2, 2).getValue()

    /** ログインに必要な情報 */
    const beforeLoginUrl = "https://ahrefs.com/user/login",
        beforeLoginResponse = UrlFetchApp.fetch(beforeLoginUrl),
        beforeLoginCookie = this.createCookie(beforeLoginResponse.getAllHeaders()["Set-Cookie"]),
        token = /"_token" type="hidden" value="(.*?)">/g.exec(beforeLoginResponse.getContentText())[1]

    /** ログイン情報 */
    const loginUrl = "https://ahrefs.com/user/login?_token=" + token + "&email=" + email + "&password=" + password + "&return_to=https%3A%2F%2Fahrefs.com%2F",
        loginOptions = {
            "method": "post",
            "headers": {
                "Cookie": beforeLoginCookie,
                "_token": token
            },
            "followRedirects": false,
            "contentType": "application/x-www-form-urlencoded"
        },
        loginResponse = UrlFetchApp.fetch(loginUrl, loginOptions)

    /** ログイン後情報 */
    const afterLoginCookie = this.createCookie(loginResponse.getAllHeaders()["Set-Cookie"]),
        afterLoginOptions = {
            "method": "get",
            "headers": {
                "Cookie": afterLoginCookie,
                "_token": token,
                "X-CSRF-Token": token
            },
            "payload": {
                "_token": token,
                "X-CSRF-Token": token
            },
            "followRedirects": false,
            "contentType": "application/x-www-form-urlencoded"
        }
    PropertiesService.getScriptProperties().setProperty("options", JSON.stringify(afterLoginOptions))
    return afterLoginOptions
}

/** クッキー配列からひとつのクッキーを作成する */
function createCookie(arrayOfCookie) {
    Logger.log("createCookie")
    var resultCookie = ""
    Object.keys(arrayOfCookie).forEach(function (key) {
        resultCookie && (function () {
            resultCookie += "; "
        })()
        resultCookie += arrayOfCookie[key]
    })
    return resultCookie
}

/** 実行処理 */
function app() {
    Logger.log("app")
    this.deleteTriggers()
    try {
        // 必要な情報を取得する
        const NOT_DONE = "0",
            RUNNING = "1",
            DONE = "2",
            ERROR_KEY = "err_count_of_batchAnalysis",
            s_props = PropertiesService.getScriptProperties(),
            spreadSheetId = s_props.getProperty("batch_analysis_spreadSheetId"),
            spreadSheet = spreadSheetId && SpreadsheetApp.openById(spreadSheetId) || SpreadsheetApp.getActiveSpreadsheet(),
            analysisSheet = spreadSheet.getSheetByName("バッチ検索"),
            analysisDataRange = analysisSheet.getDataRange(),
            analysisDataValues = analysisDataRange.getValues(),
            prop_options = s_props.getProperty("options"),
            options = prop_options && JSON.parse(prop_options) || this.getAfterLoginOptions(spreadSheet),
            startRow = (function () { // Sプロパティからの取得・再設定、もしくはプロパティの初期設定
                const keys = this.extractKeyOfNumberFromProperty(s_props)
                if (!keys.length) {
                    const row = this.getFirstStartRow(analysisDataValues)
                    if (row) {
                        this.setStartRowsOnScriptProperties(s_props, analysisDataValues, row, NUMBER_OF_ONCE_ANALYZING, NUMBER_OF_EXECUTION)
                        return row
                    }
                } else {
                    var targetArray = []
                    for (var i = 0; i < keys.length; i++) {
                        var val = s_props.getProperty(keys[i])
                        if (val == NOT_DONE) {
                            targetArray.push(parseInt(keys[i]))
                            // return parseInt(keys[i])
                        }
                    }
                    return Math.min.apply(null, targetArray)
                }
            })()
        if (startRow) { // 開始行が存在する => Sプロパティを実行中に変更
            s_props.setProperty(startRow.toString(), RUNNING)
        } else { // 開始行が存在せず、かつ全件完了している => 各種設定値をリセットし、処理を終了する, 未完了 => リセットなし、処理終了
            if (this.isComplete()) { // 処理完了時のみ
                this.endApp()
            }
            return
        }
        var executionStartLines = [] // 実行開始位置リスト
        for (var i = 0; i < NUMBER_OF_EXECUTION; i++) {
            var nextLine = startRow + NUMBER_OF_ONCE_ANALYZING * i
            if (nextLine <= analysisDataValues.length) {
                // 3行目スタートで152行まである => nextLine: 153, length: 152 => [3]
                // 3行目スタートで153行目まである => nextLine: 153, length: 153 => [3, 153]
                // 3行目スタートで2行目まである => nextLine: 3, length: 2 => []
                executionStartLines.push(startRow + NUMBER_OF_ONCE_ANALYZING * i)
            }
        }
        var totalResult = [] // 全件実行結果
        var count = 0 // 検索回数
        executionStartLines.forEach(function (executionStartLine, index) {
            const elapsedTime = this.getElapsedTime(),
                boundTime = 2.25 * 1000 * 60
            if (elapsedTime >= boundTime && count === 0) {
                throw new Error("１回目のバッチ検索を行うまでに" + boundTime + "ミリ秒以上経過しています")
            } else if (elapsedTime >= boundTime && count > 0) {
                Logger.log("処理時間が足りません。次回起動用にトリガーを再設定します。")
                s_props.setProperty((startRow + NUMBER_OF_ONCE_ANALYZING * count).toString(), NOT_DONE)
                return
            }
            const urlParamOfDomainNames = this.getUrlParamOfDomainsNames(analysisDataValues, executionStartLine, NUMBER_OF_ONCE_ANALYZING)
            if (urlParamOfDomainNames) {
                const result = this.editor(this.batchAnalyze(urlParamOfDomainNames, options), urlParamOfDomainNames)
                Array.prototype.push.apply(totalResult, result) // == 【 totalResult.push(result[0], result[1], result[2]...) 】     
                count++
            }
        })
        // トリガー設定
        this.setTrigger()
        // 色の変更
        totalResult.forEach(function (val, index) {
            if (val[3] == "Not visited by AhrefsBot yet") {
                analysisSheet.getRange(index + startRow, 4).setBackgroundRGB(255, 239, 193)
            }
        })
        if (totalResult.length) {
            // // totalResult[i],lengthのうちもっとも大きい数を取得する
            // const resultLengthArray = []
            // totalResult.forEach(function (result, index) {
            //     resultLengthArray.push(result.length)
            // })
            // maxLength = Math.max.apply(null, resultLengthArray)

            // // 長さがmaxLengthでない検索結果の配列要素調整
            // const NOTHING = "-"
            // for (var i = 0; i < resultLengthArray.length; i++) {
            //     if (resultLengthArray[i] < maxLength) {
            //         const diff = maxLength - resultLengthArray[i]
            //         for (var t = 0; t < diff; t++) {
            //             totalResult[i].push(NOTHING)
            //         }
            //     }
            // }

            // totalResult整形（列数調整）
            const x_col = totalResult[0].length,
                HYPHEN = "-"
            totalResult.forEach(function (result, index) {
                totalResult[index].length = x_col
                while (result.length < x_col) {
                    result.push(HYPHEN)
                }
            })

            // 検索結果の書き込み
            analysisSheet.getRange(startRow, 1, totalResult.length, totalResult[0].length).setValues(totalResult)
            // Sプロパティを実行完了に変更、またエラー回数を０に戻す
            s_props.setProperty(startRow.toString(), DONE).setProperty(ERROR_KEY, 0)
            if (this.isComplete()) { // トリガー起動分を含む全件検索終了時、各種設定値をリセットし、処理を終了する
                this.endApp()
            }
        }
    } catch (e) { // トリガーなし => app再実行, 例外6回以上 => リセットし処理終了, 未満 => 例外回数を記録しSプロパティ再設定
        Logger.log("error : " + e)
        const trg = ScriptApp.getProjectTriggers()
        if (!(trg && trg.length)) {
            this.setTrigger()
        }
        console.error(e)
        const beforeErrorCount = s_props.getProperty(ERROR_KEY)
        errorCount = beforeErrorCount && !isNaN(beforeErrorCount) && parseInt(beforeErrorCount) + 1 || 1
        if (errorCount > 5) {
            this.endApp()
            return
        }
        s_props.setProperty(ERROR_KEY, errorCount)
        if (startRow && s_props.getProperty(startRow.toString())) {
            Logger.log("プロパティ再設定 => NOT_DONE (0)")
            s_props.setProperty(startRow.toString(), NOT_DONE)
        }
    }
}

/** プロパティから数値であるキーを抽出する */
function extractKeyOfNumberFromProperty(s_props) {
    return s_props.getKeys().filter(function (prop, index) {
        if (isNaN(prop)) {
            return false
        } else {
            return true
        }
    })
}

/** 初期開始行を取得する。開始行が存在しない場合は値を返却しない */
function getFirstStartRow(analysisDataValues) {
    Logger.log("getFirstStartRow")
    const col_domain_index = 1,
        col_target_index = 0,
        row_target_startIndex = 2
    for (var i = row_target_startIndex; i < analysisDataValues.length; i++) {
        if (analysisDataValues[i][col_domain_index] && !analysisDataValues[i][col_target_index]) {
            return i + 1
        }
    }
}

/** スクリプトプロパティにバッチ分析の開始行を設定する */
function setStartRowsOnScriptProperties(s_props, analysisDataValues, startRow, numberOfOnceAnalyzing, numberOfExecution) {
    Logger.log("setStartRowsOnScriptProperties")
    const endRow = analysisDataValues.length,
        countOfElement = Math.floor((endRow - startRow) / (numberOfOnceAnalyzing * numberOfExecution)) + 1, // Math.floor((603 - 3) / (150 * 2)) + 1 = 3 => [3, 303, 603]
        totalNumberOfAnalyzing = numberOfOnceAnalyzing * numberOfExecution,
        NOT_DONE = "0" // 0: 未実行, 1: 実行中, 2: 実行済み
    var rows = [] // [3, 303, 603, ...]
    for (var i = 0; i < countOfElement; i++) {
        rows.push(startRow + totalNumberOfAnalyzing * i)
    }
    rows.forEach(function (row, index) {
        s_props.setProperty(row.toString(), NOT_DONE)
    })
}

/** 開始行からバッチ分析対象のドメイン名を取得する */
function getUrlParamOfDomainsNames(analysisDataValues, startRow, numberOfOnceAnalyze) {
    Logger.log("getUrlParamOfDomainsNames")
    const y_startIndex = startRow - 1,
        y_endIndex = y_startIndex + numberOfOnceAnalyze - 1,
        y_lastIndex = analysisDataValues.length - 1,
        x_index = 1

    var UrlParamOfDomainsNames = ""
    analysisDataValues.forEach(function (val, index) {
        index >= y_startIndex && index <= (y_endIndex > y_lastIndex && y_lastIndex || y_endIndex) && val[x_index] && (function () {
            UrlParamOfDomainsNames += UrlParamOfDomainsNames && "\n\r" + val[x_index] || val[x_index]
        })()
    })
    return UrlParamOfDomainsNames
}

/** バッチ検索を行い、結果を二次元配列として返却する（1回） */
function batchAnalyze(urlParamOfDomainNames, options) {
    Logger.log("batchAnalyze")
    // 全データを保管するための配列
    var result = []
    // URLパラメータ追加
    options.payload.batch_requests = urlParamOfDomainNames
    options.payload.protocol = "http+%2B+https"
    options.payload.mode = "auto"
    options.payload.history_mode = "live"

    const url = "https://ahrefs.com/batch-analysis"
    const fetch = UrlFetchApp.fetch(url, options)
    const response = fetch.getContentText().replace(/\s+|\r?\n/g, "").replace(/&mdash;/g, "—")
    const title = response.match(/<title>(.*?)<\/title>/)
    Logger.log("title: " + (function () {
        if (title) {
            return title[0]
        } else {
            return title
        }
    })())
    // Logger.log(response)
    const tableTagArray = response.match(/<tableid="batch_data_table"(.*?)<\/table>/)
    const targetTableTag = tableTagArray[0]
    const targetTbodyTag = targetTableTag.match(/<tbody>(.*?)<\/tbody>/)[0]
    const allTrTags = targetTbodyTag.match(/<tr>(.*?)<\/tr>/g)

    // 全行分のデータを１行ごとにループさせる
    Object.keys(allTrTags).forEach(function (key, index) {
        const allTdTags = allTrTags[key].match(/<td(.*?)<\/td>/g)

        // 1行分のデータを保管するための配列
        var lineData = []

        // １行中のデータを１項目ごとにループさせる
        Object.keys(allTdTags).forEach(function (key) {
            const targetTdTag = allTdTags[key].replace(/b-r-1px"><\/td>|text-xs-right"><\/td>/g, ">result nothing<\/td>").replace(/&nbsp;NotvisitedbyAhrefsBotyet/g, "Not visited by AhrefsBot yet"),
                /* 空白と改行を削除。また、Ahrefsランクや参照ドメインが返却されない場合に文字列を入れる */
                reg = />([^<].*?)</g,
                target = targetTdTag.match(reg) /* タグに挟まれたinnerTextを【タグの両端と一緒に】取得（innnerTextが存在しない場合NULL） */
            target && lineData.push(reg.exec(target[0])[1])
        })
        lineData && result.push(lineData) /* [[firstLine], [secondLine], {thirdLine}...] */
    })
    return result
}

/** バッチ検索結果の編集 */
function editor(result, urlParamOfDomainNames) {
    /**
     * result: [[domain1, num, num, num, ...], [domain2, num, num, num, ...], ...]
     * urlParamOfDomainNames: [domain1, domain2, domain3, ...]
     * result[i][0] == urlParamOfDomainNames[i] => edit
     * result[i][0] != urlParamOfDomainNames[i] => result[i]に空リスト挿入
     */
    Logger.log("editor")

    for (var i = 0; i < result.length; i++) {
        var domain = result[i][0]
        result[i].unshift('=HYPERLINK("https://web.archive.org/web/*/' + domain + '","WB")')
        result[i][1] = '=HYPERLINK("https://ahrefs.com/site-explorer/overview/v2/subdomains/live?target=' + domain + '","' + domain + '")'
    }
    // 検索結果無し用の行データを用意する
    const RESULT_NOTHING = "-",
        RESULT_NOTHING_MESSAGE = "無効なURL・ドメインが存在します",
        resultNothingArray = []
    for (var i = 0; i < result[0].length; i++) {
        if (i === 1) {
            resultNothingArray.push(RESULT_NOTHING_MESSAGE)
        } else {
            resultNothingArray.push(RESULT_NOTHING)
        }
    }
    while (result.length < NUMBER_OF_ONCE_ANALYZING) {
        result.push(resultNothingArray)
    }
    return result
}

/** トリガー設定 */
function setTrigger() {
    Logger.log("setTrigger")
    ScriptApp.newTrigger("app").timeBased().everyMinutes(1).create()
}

/** 全削除処理 */
function reset() {
    Logger.log("reset")
    const s_props = PropertiesService.getScriptProperties()
    s_props && s_props.deleteAllProperties()
    this.deleteTriggers()
}

/** トリガー削除 */
function deleteTriggers() {
    const triggers = ScriptApp.getProjectTriggers()
    Logger.log("deleteTriggers => " + triggers)
    triggers && triggers.forEach(function (trigger, index) {
        ScriptApp.deleteTrigger(trigger)
    })
}

/** 終了確認 */
function isComplete() {
    Logger.log("isComplete")
    const s_props = PropertiesService.getScriptProperties(),
        COMP = "2",
        keys = this.extractKeyOfNumberFromProperty(s_props)
    var isComp = true
    for (var i = 0; i < keys.length; i++) {
        if (s_props.getProperty(keys[i]) != COMP) {
            isComp = false
        }
    }
    return isComp
}

/** 処理開始 */
function startApp() {
    Logger.log("startApp")
    const RUNNING_COLOR = "#d7ffc7",
        spreadSheet = SpreadsheetApp.getActiveSpreadsheet(),
        spreadSheetId = spreadSheet.getId(),
        analysisSheet = spreadSheet.getSheetByName("バッチ検索"),
        analysisDataValues = analysisSheet.getDataRange().getValues(),
        domainAlertMessage = this.getDomainAlertMessage(analysisDataValues),
        emptyRowsAlertMessage = this.getEmptyRowsAlertMessage(analysisDataValues)
    if (domainAlertMessage || emptyRowsAlertMessage) {
        domainAlertMessage && Browser.msgBox(domainAlertMessage)
        emptyRowsAlertMessage && Browser.msgBox(emptyRowsAlertMessage)
        this.endApp()
        return
    }
    // トリガー起動用プロパティの設定
    PropertiesService.getScriptProperties().setProperty("batch_analysis_spreadSheetId", spreadSheetId)
    analysisSheet.getRange(1, 1, 2, 25).setBackground(RUNNING_COLOR)
    this.app()
}

/** 処理終了 */
function endApp() {
    Logger.log("endApp")
    const s_props = PropertiesService.getScriptProperties(),
        spreadSheetId = s_props.getProperty("batch_analysis_spreadSheetId")
    this.reset()
    const spreadSheet = spreadSheetId && SpreadsheetApp.openById(spreadSheetId) || SpreadsheetApp.getActiveSpreadsheet()
    if (spreadSheet) {
        const analysisSheet = spreadSheet.getSheetByName("バッチ検索"),
            END_COLOR = "#fce5cd"
        analysisSheet.getRange(1, 1, 2, 25).setBackground(END_COLOR)
    }
}

/** ドメインの警告メッセージ取得 */
function getDomainAlertMessage(analysisDataValues) {
    const y_startIndex = 2,
        x_index = 1,
        y_endIndex = analysisDataValues.length - 1
    var invalidUrls = [],
        message = ""
    for (var i = y_startIndex; i <= y_endIndex; i++) { // i : 2はじまり
        if (analysisDataValues[i][x_index + 1]) {
            continue
        }
        var target = analysisDataValues[i][x_index]
        target && (function () {
            var include = target.match(/(.+)\.(.+)/)
            if (!include) {
                invalidUrls.push(target)
            }
        })()
    }
    if (invalidUrls) {
        invalidUrls.forEach(function (val, index) {
            if (message) {
                message += "\\n" + val
            } else {
                message = "以下のドメイン/URLは無効です.\\n" + val
            }
        })
    }
    return message
}

/** 空白行の警告メッセージ取得 */
function getEmptyRowsAlertMessage(analysisDataValues) {
    const y_startIndex = 2,
        x_index = 1,
        y_endIndex = analysisDataValues.length - 1
    var emptyRows = [],
        message = ""
    for (var i = y_startIndex; i <= y_endIndex; i++) { // i : 2はじまり
        analysisDataValues[i][x_index] || emptyRows.push(i + 1)
    }
    if (emptyRows) {
        emptyRows.forEach(function (emptyRow, index) {
            if (message) {
                message += ", " + emptyRow + "行目"
            } else {
                message = "以下に不要な空白行が存在します.\\n" + emptyRow + "行目"
            }
        })
    }
    return message
}

/** 経過時間を取得 */
function getElapsedTime(start_time) {
    var current_time = new Date()
    var elapsed_time = current_time.getTime() - this.start_time.getTime()
    return elapsed_time
}

/**
 * ステータス設計
 * ----------------------
 * 処理終了：#fce5cd
 * 処理実行中：#d7ffc7
 */