const router = require('koa-router')()
const helper = require('../config/helper')
const db = require('../config/db')
const uuid = require('uuid')
const jwt = require('../config/jwt')

router.prefix('/users')

const getUserinfo = async (code, appId, appKey, encryptedData, iv) => {
    const userinfo = await helper.privateData(code, appId, appKey)
    const users = helper.decryptData(encryptedData, userinfo.session_key, iv, appId)
    return {
        openid: users.openId,
        wx_info: {
            nickname: users.nickName,
            gender: users.gender,
            language: users.language,
            city: users.city,
            province: users.province,
            country: users.country,
            avatarUrl: users.avatarUrl,
            watermark: users.watermark
        }
    }
}

router.post('/', async (ctx, next) => {
    const req = ctx.request.body
    const [res, error] = helper.tryCatch(await new Promise(async(resolve, reject) => {
        const [userres, error0] = helper.tryCatch(getUserinfo(req.code, req.appId, req.appKey, req.encryptedData, req.iv))
        if (error) { reject(error0) }

        db.pool.getConnection(async (error, connection) => {
            if (error) { reject(error) }
            let userId
            const [existRes, error1] = helper.tryCatch(await db.query(connection, `select user_id from users where wx_openid = ?`, [userres.openid]))
            if (error1) { reject(error1) }
            if (existRes.length === 1) {
                userId = existRes[0]
                const [, error2] = helper.tryCatch(await db.query(connection, `update users set wx_info = ? where user_id = ?`, [userres.wx_info, userId]))
                if (error2) { reject(error2) }
            } else {
                userId = uuid.v1()
                const [, error3] = helper.tryCatch(await db.query(connection, `insert into users(user_id, wx_openid, wx_info) values(?, ?, ?)`, [userId, userres.openid, userres.wx_info]))
                if (error3) { reject(error3) }
            }
            const [queryRes, error4] = helper.tryCatch(await db.query(connection, `select user_id, wx_openid, wx_info, stuid, createTime, updateTime from users where user_id = ?`, [userId]))
            if (error4) { reject(error4) }
            const token = jwt.productToken(userId)
            resolve({ token: token, sessionToken: queryRes })
            connection.release()
        })
    }))
    if (error) { next(error) }
    ctx.body = res
})

router.get('/bar', function (ctx, next) {
    ctx.body = 'this is a users/bar response'
})

module.exports = router
